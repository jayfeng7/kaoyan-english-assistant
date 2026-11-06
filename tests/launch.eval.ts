import { it, expect } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { evaluateEssay, judgeEssay } from '@/lib/evaluation/essay';
import { essayEvalReportSchema } from '@/lib/schemas/evaluation';
import { essayBankItemSchema } from '@/lib/schemas/essay-bank';
import { essayBankPrompt } from '@/lib/client/essay-input';
import type { EssayEvalRecord } from '@/types';
import { essayEvalCases } from './evaluation-fixtures';


it('runs explicit live acceptance and same-model review without treating it as teacher validation', async () => {
  if (process.env.EVAL_LIVE !== '1') throw new Error('Set EVAL_LIVE=1 explicitly; this invokes configured paid providers.');
  const base = process.env.EVAL_BASE ?? 'http://127.0.0.1:3110'; const url = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Live evaluation targets the isolated local candidate only.');
  const attempts = Number(process.env.EVAL_ATTEMPTS ?? '1');
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 3) throw new Error('EVAL_ATTEMPTS must be 1, 2 or 3.');
  const records: EssayEvalRecord[] = [];
  for (let attempt = 1; attempt <= attempts; attempt++) {
  for (const item of structuredClone(essayEvalCases)) {
    const response = await fetch(base + '/api/essay/bank/' + item.input.bankId); const raw: unknown = await response.json();
    if (typeof raw !== 'object' || !raw || !('data' in raw)) throw new Error('EVAL_BANK_UNAVAILABLE');
    item.input.prompt = essayBankPrompt(essayBankItemSchema.parse(raw.data));
    const row = await evaluateEssay(item, attempt, async (input, signal) => {
      const result = await fetch(base + '/api/essay/correct', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal });
      const body: unknown = await result.json(); return { status: result.status, body };
    }, judgeEssay, AbortSignal.timeout(135_000));
    records.push(row);
    process.stdout.write(JSON.stringify({ caseId: row.caseId, attempt, status: row.status, score: row.score, issues: row.issueCodes, referenceIssues: row.referenceIssues, judgeStatus: row.judge.status }) + '\n');
  }
  }
  const fingerprint = createHash('sha256');
  for (const file of ['lib/prompts/essay.ts', 'lib/llm/client.ts', 'lib/evaluation/essay.ts', 'lib/schemas/evaluation.ts', 'lib/schemas/essay.ts', 'tests/evaluation-fixtures.ts', 'types/index.ts']) fingerprint.update(file).update(await readFile(file));
  const report = essayEvalReportSchema.parse({ at: new Date().toISOString(), codeCommit: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(), sourceFingerprint: fingerprint.digest('hex'), workingTreeDirty: Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim()), base, model: process.env.DEEPSEEK_MODEL ?? 'deepseek-flash', records, teacherStatus: 'pending', teacherQualityPassed: false, allDeterministicPassed: records.every((row) => row.status === 'structured' && row.schemaValid && row.originalReferencesValid && row.commentReferencesValid) });
  const directory = path.resolve('artifacts/launch-acceptance-20261020'); await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `eval-${Date.now()}.json`), JSON.stringify(report, null, 2) + '\n');
  expect(report.allDeterministicPassed, 'See metadata-only report; no retry overwrites first failures.').toBe(true);
  expect(records.every((row) => row.judge.status === 'completed'), 'Invalid or failed judges do not count as completed evaluations.').toBe(true);
}, 600_000);
