import { loadEnvFile } from 'node:process';
import { writeFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { buildEssayPrompt } from '@/lib/prompts/essay';
import { buildProviderRequest, createProviderClient } from '@/lib/llm/client';
import { getProviders } from '@/lib/llm/providers';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import { repairJson } from '@/lib/utils/json-repair';
import { essayEvalCases } from './evaluation-fixtures';
import { getEssayBankItem } from '@/lib/essay-bank';
import { essayBankPrompt } from '@/lib/client/essay-input';

// Explicitly invoked, paid, offline diagnostic. Persist metadata only.
it.skipIf(process.env.RUN_ESSAY_STREAM_LIVE !== '1')('checks an explicitly selected real essay call without logging its content', async () => {
  loadEnvFile('.env.local');
  const item = essayEvalCases.find(item => item.id === (process.env.ESSAY_DIAGNOSTIC_CASE ?? 'synthetic-e2-big'));
  if (!item) throw new Error('UNKNOWN_SYNTHETIC_CASE');
  const input = { ...item.input, prompt: item.input.bankId ? essayBankPrompt(await getEssayBankItem(item.input.bankId)) : item.input.prompt, wordCount: item.input.essay.trim().split(/\s+/u).length };
  const provider = getProviders()[0]!;
  const params = buildEssayPrompt(input);
  const started = performance.now(); let firstMs: number | undefined; let finish: string | null = null; let tokens: number | undefined; let content = '';
  if (process.env.ESSAY_DIAGNOSTIC_MODE === 'json') {
    const completion = await createProviderClient(provider).chat.completions.create(buildProviderRequest(provider, { ...params, json: true }), { signal: AbortSignal.timeout(60_000) });
    content = completion.choices[0]?.message.content ?? ''; finish = completion.choices[0]?.finish_reason ?? null; tokens = completion.usage?.completion_tokens;
  } else {
    const stream = await createProviderClient(provider).chat.completions.create({ ...buildProviderRequest(provider, { ...params, json: true }), stream: true, stream_options: { include_usage: true } }, { signal: AbortSignal.timeout(60_000) });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta.content;
      if (text) { firstMs ??= Math.round(performance.now() - started); content += text; }
      finish = chunk.choices[0]?.finish_reason ?? finish; tokens = chunk.usage?.completion_tokens ?? tokens;
    }
  }
  const repaired = repairJson(content);
  const checked = repaired.success ? createEssayResultSchema(input.type, input.composition).safeParse(repaired.data) : undefined;
  const report = { caseId: item.id, mode: process.env.ESSAY_DIAGNOSTIC_MODE === 'json' ? 'json' : 'stream', at: new Date().toISOString(), firstMs, elapsedMs: Math.round(performance.now() - started), finish, tokens, json: repaired.success, valid: checked?.success ?? false, issues: checked && !checked.success ? checked.error.issues.map(issue => ({ path: issue.path, code: issue.code })) : [] };
  await writeFile(`artifacts/essay-stream-20261024/live-diagnostic-${Date.now()}.json`, JSON.stringify(report, null, 2));
  expect(report.valid).toBe(true);
}, 70_000);
