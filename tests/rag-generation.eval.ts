import { mkdir, writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { getProviders } from '@/lib/llm/providers';
import { streamWithFallback } from '@/lib/llm/stream';
import { buildChatPrompt } from '@/lib/prompts/chat';
import { groundingForCards } from '@/lib/rag';
import { searchEssayKnowledge, type RetrievalMode } from '@/lib/rag/retriever';
import cards from '@/lib/rag/cards.json';
import { cases, mean, percentile, toChatRequest } from './rag-eval-fixtures';

const checks: Record<string, (answer: string) => boolean> = {
  H01: (answer) => /(?:let me know|confirm|reply|rsvp)/iu.test(answer) && /(?:whether|if|can (?:come|join|attend)|attendance)/iu.test(answer),
  H06: (answer) => /15\s*(?:个?百分点|percentage points)/iu.test(answer) && /50\s*(?:%|％|percent)/iu.test(answer),
  H13: (answer) => /(?:删(?:去|掉|除)?|去掉|删除|drop|remove|omit)\s*[*`"「“]*\s*but\b/iu.test(answer) ||
    /Although I was tired,\s*I (?:still )?studied/iu.test(answer),
  H16: (answer) => /\b(?:[Hh]e|[Ss]he|[Ii]t|[A-Z][a-z]+)\s+[a-z]{2,}s\b/u.test(answer) &&
    /(?:第三人称|主谓一致|third.person|present tense|singular|add.?s)/iu.test(answer),
  H20: (answer) => /(?:不能|无法|不会|不可以|不改|不能直接|不能擅自)/u.test(answer),
};
type GenerationMode = RetrievalMode | 'none' | 'oracle';
type GenerationRow = {
  id: string;
  mode: GenerationMode;
  answer: string;
  evidence: string[];
  citations: string[];
  contentCheck: boolean;
  citationPrecision: number | null;
  relevantCitation: boolean | null;
  noCitationWhenUnanswerable: boolean | null;
  firstMs: number;
  totalMs: number;
};

it('compares the same generator with no evidence, retrieved evidence and oracle evidence', async () => {
  const provider = getProviders()[0];
  if (!provider) throw new Error('Configure a generator before running the live evaluation');
  const variants: GenerationMode[] = ['none', 'keyword', 'vector', 'hybrid', 'oracle'];
  const rows: GenerationRow[] = [];
  for (const row of cases.filter(({ id }) => Object.hasOwn(checks, id))) {
    const input = toChatRequest(row);
    if (row.id === 'H20' && input.followUp) {
      input.followUp.summary = JSON.stringify({ composition: row.composition, prompt: row.prompt, result: { scoreCard: { score: 8 } } });
    }
    const relevant = new Set(Object.keys(row.relevance));
    for (const mode of variants) {
      const start = performance.now();
      const signal = AbortSignal.timeout(65_000);
      const evidence = mode === 'none' ? [] : mode === 'oracle' ? cards.filter(({ id }) => relevant.has(id)).slice(0, 2)
        : (await searchEssayKnowledge(input, { mode, strict: true, signal })).cards;
      const grounding = groundingForCards(evidence);
      let answer = '';
      let firstMs = 0;
      let completed = false;
      for await (const event of streamWithFallback({ ...buildChatPrompt(input, grounding?.instructions), signal }, { providers: [provider] })) {
        if (event.type === 'delta') {
          const text = grounding ? grounding.filterDelta(event.content) : event.content;
          if (!firstMs && text.trim()) firstMs = performance.now() - start;
          answer += text;
        } else if (event.type === 'done') {
          completed = true;
        }
      }
      expect(completed && answer.trim().length > 0).toBe(true);
      const citations = grounding?.citations() ?? [];
      const right = citations.filter(({ id }) => relevant.has(id)).length;
      rows.push({ id: row.id, mode, answer, evidence: evidence.map(({ id }) => id), citations: citations.map(({ id }) => id),
        contentCheck: checks[row.id]!(answer), citationPrecision: citations.length ? right / citations.length : null,
        relevantCitation: relevant.size ? right > 0 : null, noCitationWhenUnanswerable: relevant.size ? null : citations.length === 0,
        firstMs, totalMs: performance.now() - start });
    }
  }
  const summary = variants.map((mode) => {
    const results = rows.filter((row) => row.mode === mode);
    return { mode, cases: results.length, contentCheck: mean(results.map((row) => Number(row.contentCheck))),
      citationPrecision: mean(results.map((row) => row.citationPrecision)),
      relevantCitation: mean(results.map((row) => row.relevantCitation === null ? null : Number(row.relevantCitation))),
      noCitationWhenUnanswerable: mean(results.map((row) => row.noCitationWhenUnanswerable === null ? null : Number(row.noCitationWhenUnanswerable))),
      ttftP95Ms: percentile(results.map((row) => row.firstMs), 0.95),
      totalP95Ms: percentile(results.map((row) => row.totalMs), 0.95) };
  });
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/rag-generation-eval.json', JSON.stringify({ model: provider.model, summary, rows }, null, 2));
  process.stdout.write('RAG answer results saved to artifacts/rag-generation-eval.json\n');
});
