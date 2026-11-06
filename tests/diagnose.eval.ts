import { it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getProviders } from '@/lib/llm/providers';
import { buildProviderRequest, createProviderClient } from '@/lib/llm/client';
import { buildEssayPrompt } from '@/lib/prompts/essay';
import { repairJson } from '@/lib/utils/json-repair';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import { essayEvalCases } from './evaluation-fixtures';
import { getEssayBankItem } from '@/lib/essay-bank';
import { essayBankPrompt } from '@/lib/client/essay-input';
import type { EssayCorrectRequest } from '@/types';
import { getBankItem } from '@/lib/exam-bank';
import { buildExamPrompt } from '@/lib/prompts/exam';
import { examResultSchema } from '@/lib/schemas/exam';

it.skipIf(process.env.EVAL_DIAGNOSTIC !== '1')('diagnoses JSON completion metadata without retaining content', async () => {
  if (process.env.EVAL_LIVE !== '1') throw new Error('Explicit live evaluation required.');
  const provider = getProviders().find((item) => item.id === 'deepseek'); if (!provider) throw new Error('Missing provider');
  const input = { type: 'english2' as const, composition: 'small' as const, prompt: 'Suppose you are a student who wants to join the university volunteer program. Write an email to the coordinator, Mr. Smith, to apply for it. Do not sign your own name.', essay: 'Dear Mr. Smith,\nI am Li Ming, a sophomore from the School of Foreign Languages. I am writing to apply for the volunteer program of our university.\nI have a strong passion for public service. Last year, I worked as a volunteer in the city library, where I helped organize reading activities for children. In addition, I am good at English and communication, which enables me to serve foreign visitors.\nI would appreciate it if you could give me a chance. I am looking forward to your reply.\nYours sincerely,\nLi Ming' };
  const selected = essayEvalCases.find((item) => item.id === process.env.EVAL_DIAGNOSTIC_CASE);
  const resolved: EssayCorrectRequest = selected ? structuredClone(selected.input) : input;
  if (resolved.source === 'bank' && resolved.bankId) resolved.prompt = essayBankPrompt(await getEssayBankItem(resolved.bankId));
  const prompt = buildEssayPrompt({ ...resolved, wordCount: resolved.essay.trim().split(/\s+/u).length }); const configured = Number(process.env.LLM_MAX_TOKENS ?? 8000); const start = Date.now();
  const request = buildProviderRequest(provider, { ...prompt, json: true, maxTokens: configured });
  const response = await createProviderClient(provider).chat.completions.create(request);
  const first = response.choices[0]; const content = first?.message.content ?? ''; const parsed = repairJson(content);
  const validated = parsed.success ? createEssayResultSchema(resolved.type, resolved.composition).safeParse(parsed.data) : undefined;
  // Never retain arbitrary model-controlled keys or validation messages.
  const allowedKeys = new Set(['scoreCard', 'band', 'level', 'name', 'range', 'score', 'bandReason', 'breakdown', 'content', 'language', 'structure', 'overallComment', 'sentenceAnnotations', 'index', 'original', 'type', 'comment', 'correction', 'grammarPoint', 'improvedEssay', 'modelEssay', 'expressions', 'expression', 'meaning', 'example', 'suggestions']);
  const schemaIssues = validated && !validated.success ? validated.error.issues.map((issue) => ({ code: issue.code, path: issue.path.map((part) => typeof part === 'number' ? part : allowedKeys.has(part) ? part : 'unknown_field') })) : [];
  const reasoning = first && 'reasoning_content' in first.message && typeof first.message.reasoning_content === 'string' ? first.message.reasoning_content.length : null;
  const reason = first && ['stop', 'length', 'content_filter', 'tool_calls', 'function_call'].includes(first.finish_reason) ? first.finish_reason : 'unknown';
  const report = { at: new Date().toISOString(), provider: provider.id, model: provider.model, thinkingMode: request.thinking?.type ?? 'provider-default', configuredMaxTokens: configured, durationMs: Date.now() - start, finishReason: reason, contentCharacters: content.length, reasoningCharacters: reasoning, repairedJson: parsed.success, schemaValid: validated?.success ?? false, schemaIssues, promptTokens: response.usage?.prompt_tokens ?? null, completionTokens: response.usage?.completion_tokens ?? null, totalTokens: response.usage?.total_tokens ?? null };
  const directory = path.resolve('artifacts/launch-acceptance-20261020'); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, `diagnostic-${Date.now()}.json`), JSON.stringify(report, null, 2)+'\n');
  process.stdout.write(JSON.stringify(report)+'\n'); expect(parsed.success, 'Only metadata retained; malformed output is not success.').toBe(true);
}, 90_000);

it.skipIf(process.env.EVAL_DIAGNOSTIC !== '1' || process.env.EVAL_DIAGNOSTIC_EXAM !== '1')('diagnoses the failed exam case without retaining passage or completion', async () => {
  if (process.env.EVAL_LIVE !== '1') throw new Error('Explicit live evaluation required.');
  const provider = getProviders().find((item) => item.id === 'deepseek'); if (!provider) throw new Error('Missing provider');
  const item = await getBankItem('english1-2019-text1'); const question = item.questions.find((entry) => entry.id === 'english1-2019-text1-q22'); if (!question) throw new Error('Missing question');
  const prompt = buildExamPrompt({ type: item.type, source: 'bank', bankId: item.id, passage: item.passage, questionId: question.id, question: question.question, options: question.options, referenceAnswer: question.answer, referenceAnalysis: question.analysis, translate: false });
  const started = Date.now(); const response = await createProviderClient(provider).chat.completions.create(buildProviderRequest(provider, { ...prompt, json: true }));
  const first = response.choices[0]; const content = first?.message.content ?? ''; const repaired = repairJson(content); const validated = repaired.success ? examResultSchema.safeParse(repaired.data) : undefined;
  let syntaxPosition: number | undefined; let syntaxToken: string | undefined; let syntaxDepth: number | undefined;
  try { JSON.parse(content); } catch (error) {
    // Error messages may contain model text. Extract a numeric offset only.
    const match = error instanceof SyntaxError ? /position (\d+)/u.exec(error.message) : null;
    if (match) {
      syntaxPosition = Number(match[1]); const char = content[syntaxPosition]; syntaxToken = char && '{}[],:"'.includes(char) ? char : char && /\s/u.test(char) ? 'whitespace' : 'other';
      let quoted = false; let escaped = false; syntaxDepth = 0;
      for (const token of content.slice(0, syntaxPosition)) {
        if (quoted) { if (escaped) escaped = false; else if (token === '\\') escaped = true; else if (token === '"') quoted = false; }
        else if (token === '"') quoted = true; else if (token === '{' || token === '[') syntaxDepth++; else if (token === '}' || token === ']') syntaxDepth--;
      }
    }
  }
  const report = { at: new Date().toISOString(), feature: 'exam', thinkingMode: 'disabled', durationMs: Date.now() - started, finishReason: first?.finish_reason === 'stop' ? 'stop' : first?.finish_reason === 'length' ? 'length' : 'other', contentCharacters: content.length, repairedJson: repaired.success, schemaValid: validated?.success ?? false, issueCodes: validated && !validated.success ? validated.error.issues.map((issue) => issue.code) : [], syntaxPosition, syntaxToken, syntaxDepth, completionTokens: response.usage?.completion_tokens ?? null };
  const directory = path.resolve('artifacts/launch-acceptance-20261021'); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, `diagnostic-exam-${Date.now()}.json`), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n'); expect(validated?.success).toBe(true);
}, 90_000);
