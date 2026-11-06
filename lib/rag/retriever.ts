import 'server-only';
import type { ChatRequest } from '@/types';
import { buildIndex } from './bm25.mjs';
import { embed, modelDigest } from './embed';
import { loadVectorIndex } from './vector-index';
import cards from './cards.json';

type Card = typeof cards[number];
type Hit = { id: string; score: number };
export type RetrievalMode = 'keyword' | 'vector' | 'hybrid';
const candidateLimit = 6;
const defaultMinimumCosine = 0.4;
const secondaryCosineGap = 0.12;
const byId = new Map(cards.map((card) => [card.id, card]));
const index = buildIndex(cards);
const genres = {
  invitation: /邀请|\binvit(?:e|es|ing|ation|ations)\b/iu,
  notice: /通知|公告|\b(?:notice|announcement)\b/iu,
  request: /请求信|求助信|\b(?:letter|email) (?:of|to) request\b|\brequest(?:ing)? (?:help|assistance)\b/iu,
  apology: /道歉|致歉|\bapolog(?:y|ize|ise|izing|ising)\b/iu,
  advice: /建议信|提建议|\b(?:offer|give|giving) (?:some )?(?:advice|suggestions)\b/iu,
  chart: /图表|柱状图|折线图|饼图|\b(?:chart|graph)\b/iu,
  picture: /图画|漫画|\b(?:picture|cartoon|drawing)\b/iu,
};

function genreOf(text: string): string | undefined {
  const matches = Object.entries(genres).filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0]?.[0] : undefined;
}

function matchesKeyword(query: string, keyword: string): boolean {
  if (/[^\x00-\x7F]/u.test(keyword)) return query.includes(keyword);
  // A word boundary keeps short English signals out of unrelated words.
  return (' ' + query.replace(/[^a-z0-9]+/gu, ' ') + ' ').includes(' ' + keyword.replaceAll('-', ' ') + ' ');
}

export function prepareEssayQuery(input: ChatRequest, rewrite = true) {
  const last = input.messages.at(-1);
  if (input.followUp?.kind !== 'essay' || last?.role !== 'user') return;
  if (input.followUp.summary.length > 50_000) return;

  let snapshot: unknown;
  try { snapshot = JSON.parse(input.followUp.summary); } catch { return; }
  if (!snapshot || typeof snapshot !== 'object' || !('composition' in snapshot)) return;
  const { composition } = snapshot;
  if (composition !== 'small' && composition !== 'big') return;
  const question = last.content.slice(0, 2000).normalize('NFKC').trim();
  const prompt = 'prompt' in snapshot && typeof snapshot.prompt === 'string' ? snapshot.prompt.slice(0, 6000) : '';
  // Only resolve complete, short pointers. A new substantive question keeps its own topic.
  const pointer = /^(?:请)?\s*(?:再(?:举|给)(?:个|一[个句条])?(?:例子|例句|示例)(?:吧|吗)?|换(?:个|一[个句条])(?:例子|例句|说法)|(?:第[一二三12]条|这条|那条)(?:是什么意思|怎么用|呢)|(?:can you (?:give me )?)?another example(?: please)?|how do i use that rule)[\s?？。.!！]*$/iu;
  const previous = rewrite && question.length <= 80 && pointer.test(question)
    ? input.messages.slice(-8, -1).reverse().find((message) => message.role === 'user' && !pointer.test(message.content.trim()))
    : undefined;
  const antecedent = previous?.content.slice(0, 1000);
  const promptGenre = genreOf(prompt);
  const queryGenre = genreOf(question) ?? (antecedent ? genreOf(antecedent) : undefined);
  const conflict = !!promptGenre && !!queryGenre && promptGenre !== queryGenre;
  return { composition, genre: promptGenre ?? queryGenre, conflict,
    query: antecedent ? `${antecedent}\n${question}` : question, rewritten: !!antecedent };
}

function rankHits(hits: Hit[]): Hit[] {
  return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, candidateLimit);
}

export function fuseRankings(keyword: Hit[], vector: Hit[]): Hit[] {
  const scores = new Map<string, number>();
  for (const ranking of [keyword, vector]) {
    ranking.forEach(({ id }, rank) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)));
  }
  return rankHits([...scores].map(([id, score]) => ({ id, score })));
}

export function packEssayEvidence(hits: Hit[], keyword: Hit[], vector: Hit[]): Hit[] {
  const bestCosine = vector[0]?.score;
  if (bestCosine === undefined) return hits.slice(0, 2);
  // A weaker dense-only match can distract generation even when it ranks second.
  const corroborated = new Set(keyword.map(({ id }) => id));
  const denseScores = new Map(vector.map(({ id, score }) => [id, score]));
  return hits.filter(({ id }, rank) => {
    const score = denseScores.get(id);
    return rank === 0 || corroborated.has(id) || (score !== undefined && bestCosine - score <= secondaryCosineGap);
  }).slice(0, 2);
}

type RetrievalOptions = {
  mode?: RetrievalMode;
  rewrite?: boolean;
  requireKeywordAnchor?: boolean;
  minimumCosine?: number;
  signal?: AbortSignal;
  strict?: boolean;
};

export async function searchEssayKnowledge(input: ChatRequest, options: RetrievalOptions = {}) {
  const started = performance.now();
  const configured = process.env.ESSAY_RAG_MODE;
  const mode = options.mode ?? (configured === 'vector' || configured === 'hybrid' ? configured : 'keyword');
  const prepared = prepareEssayQuery(input, options.rewrite ?? process.env.ESSAY_RAG_REWRITE !== '0');
  let denseMs = 0;
  let fallback = false;
  let keyword: Hit[] = [];
  let vector: Hit[] = [];
  let hits: Hit[] = [];
  if (prepared?.query && !prepared.conflict) {
    const { composition, genre, query } = prepared;
    const eligible = (card: Card) => (card.composition === 'any' || card.composition === composition) &&
      (card.genres.includes('any') || (genre !== undefined && card.genres.includes(genre)));
    const lexical = () => {
      const normalized = query.normalize('NFKC').toLowerCase();
      return index.search(normalized, {
        composition, genre, k: candidateLimit,
        accept: (card) => eligible(card) && (options.requireKeywordAnchor === false ||
          card.keywords.some((term) => matchesKeyword(normalized, term))),
      }).hits.map(({ id, score }) => ({ id, score }));
    };
    if (mode !== 'vector') keyword = lexical();
    if (mode !== 'keyword') {
      const denseStart = performance.now();
      try {
        const timeout = AbortSignal.timeout(2500);
        const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
        const vectorIndex = await loadVectorIndex();
        if (vectorIndex.digest !== await modelDigest(signal)) throw new Error('Embedding model digest does not match the index');
        const [queryVector] = await embed([query], 'query', signal);
        if (!queryVector) throw new Error('Missing query vector');
        const configuredThreshold = Number(process.env.ESSAY_RAG_MIN_COSINE ?? defaultMinimumCosine);
        const threshold = options.minimumCosine ?? (configuredThreshold > 0 && configuredThreshold <= 1 ? configuredThreshold : defaultMinimumCosine);
        vector = rankHits(vectorIndex.vectors.flatMap(({ id, vector }) => {
          const card = byId.get(id);
          if (!card || !eligible(card)) return [];
          const score = vector.reduce((sum, value, i) => sum + value * queryVector[i]!, 0);
          return score >= threshold ? [{ id, score }] : [];
        }));
      } catch (error) {
        if (options.strict || options.signal?.aborted) throw error;
        fallback = true;
        if (mode === 'vector') keyword = lexical();
      } finally {
        denseMs = performance.now() - denseStart;
      }
    }
    hits = mode === 'keyword' || fallback ? keyword : mode === 'vector' ? vector : fuseRankings(keyword, vector);
  }
  const evidence = packEssayEvidence(hits, keyword, vector);
  const selected = evidence.map(({ id }) => byId.get(id)!);
  return { mode, rewritten: prepared?.rewritten ?? false, fallback, keyword, vector, hits, evidence, cards: selected,
    denseMs, durationMs: performance.now() - started };
}

export async function retrieveEssayCards(input: ChatRequest, signal?: AbortSignal) {
  if (process.env.ESSAY_RAG_ENABLED === '0') return [];
  const result = await searchEssayKnowledge(input, { signal });
  if (process.env.ESSAY_RAG_TRACE === '1' && input.followUp?.kind === 'essay') {
    const { mode, rewritten, fallback, denseMs, durationMs } = result;
    process.stdout.write(JSON.stringify({ component: 'essay-rag', mode, rewritten, fallback, denseMs, durationMs,
      keywordCount: result.keyword.length, vectorCount: result.vector.length, sourceIds: result.cards.map(({ id }) => id) }) + '\n');
  }
  return result.cards;
}
