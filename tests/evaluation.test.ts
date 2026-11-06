import { describe, expect, it, vi } from 'vitest';
import { evaluateEssay } from '@/lib/evaluation/essay';
import { evalJudgeOutputSchema, essayEvalReportSchema } from '@/lib/schemas/evaluation';
import { makeEssayResult } from './fixtures';
import type { EssayEvalCase, EvalHttpCall, EvalJudgeCall, EvalJudgeOutput } from '@/types';
import { characterErrorRate, normalizeOcrText } from '@/lib/evaluation/metrics';

const testCase: EssayEvalCase = { id: 'synthetic-e1-big', synthetic: true, input: { type: 'english1', composition: 'big', prompt: 'Write about practice.', essay: 'Learning takes practice.' } };
const judgments: EvalJudgeOutput = { judgments: [{ criterion: 'task_alignment', verdict: 'pass' }, { criterion: 'feedback_correctness', verdict: 'uncertain' }, { criterion: 'revision_consistency', verdict: 'pass' }] };
const request: EvalHttpCall = async () => ({ status: 200, body: { success: true, data: makeEssayResult(), provider: 'deepseek' } });
const judge: EvalJudgeCall = async () => ({ output: judgments, provider: 'deepseek' });

describe('offline evaluation agent', () => {
  it('computes character errors with Unicode characters and preserves case and punctuation', () => {
    expect(characterErrorRate('abc', 'axcd')).toMatchObject({ edits: 2, referenceCharacters: 3, cer: 2 / 3 });
    expect(characterErrorRate('🙂a', '🙂')).toMatchObject({ edits: 1, referenceCharacters: 2, cer: 0.5 });
    expect(characterErrorRate('A.', 'a')).toMatchObject({ edits: 2 });
    expect(normalizeOcrText(' A\r\n  B ')).toBe('A B'); expect(() => characterErrorRate('', 'x')).toThrow('EVAL_REFERENCE_EMPTY');
  });
  it('separates deterministic checks, same-model judgment and missing teacher evidence', async () => {
    const result = await evaluateEssay(testCase, 1, request, judge, new AbortController().signal);
    expect(result).toMatchObject({ status: 'structured', score: 14, schemaValid: true, originalReferencesValid: true, commentReferencesValid: true, teacherStatus: 'pending', judge: { status: 'completed', sameModel: true, judgments: judgments.judgments } });
    const encoded = JSON.stringify(result); expect(encoded).not.toContain(testCase.input.essay); expect(encoded).not.toContain('Learning'); expect(encoded).not.toContain('improvedEssay');
  });
  it.each(['text', 'invalid', 'http', 'transport'] as const)('keeps %s failures without invoking the judge', async (kind) => {
    const broken: EvalHttpCall = async () => { if (kind === 'transport') throw new Error('SECRET_PRIVATE_BODY'); return { status: kind === 'http' ? 500 : 200, body: { success: true, data: kind === 'text' ? { text: 'SECRET_PRIVATE_BODY' } : {} } }; };
    const mockedJudge = vi.fn<EvalJudgeCall>(judge); const result = await evaluateEssay(testCase, 1, broken, mockedJudge, new AbortController().signal);
    expect(result.schemaValid).toBe(false); expect(result.status).toBe(({ text: 'text_fallback', invalid: 'invalid_schema', http: 'http_error', transport: 'transport_error' })[kind]);
    expect(mockedJudge).not.toHaveBeenCalled(); expect(JSON.stringify(result)).not.toContain('SECRET_PRIVATE_BODY');
  });
  it('detects fabricated quotations independently of a positive judge', async () => {
    const altered = makeEssayResult(); altered.sentenceAnnotations[0]!.original = 'Invented quotation.'; altered.sentenceAnnotations[0]!.comment = '“Invented” is fluent.';
    const result = await evaluateEssay(testCase, 1, async () => ({ status: 200, body: { success: true, data: altered } }), judge, new AbortController().signal);
    expect(result.originalReferencesValid).toBe(false); expect(result.commentReferencesValid).toBe(false); expect(result.issueCodes).toEqual(['original_reference', 'comment_reference']);
  });
  it.each(['“Learning”', '"Learning"', '「Learning」', '‘Learning’', "'Learning'"])('accepts standard quotation style %s without relaxing verbatim matching', async (quoted) => {
    const result = makeEssayResult(); result.sentenceAnnotations[0]!.comment = quoted + ' is appropriate.';
    expect((await evaluateEssay(testCase, 1, async () => ({ status: 200, body: { success: true, data: result } }), judge, new AbortController().signal)).commentReferencesValid).toBe(true);
  });
  it('rejects duplicated criteria and free-form judge output rather than persisting it', async () => {
    expect(evalJudgeOutputSchema.safeParse({ judgments: Array(3).fill(judgments.judgments[0]) }).success).toBe(false);
    const result = await evaluateEssay(testCase, 1, request, async () => ({ output: { ...judgments, privateText: 'SECRET_PRIVATE_BODY' }, provider: 'deepseek' }), new AbortController().signal);
    expect(result.judge.status).toBe('invalid'); expect(result.judge.judgments).toEqual([]); expect(JSON.stringify(result)).not.toContain('SECRET_PRIVATE_BODY');
  });
  it('does not invoke a judge after cancellation and never retries a failed judge', async () => {
    const controller = new AbortController(); const mockedJudge = vi.fn<EvalJudgeCall>(judge);
    await evaluateEssay(testCase, 1, async (input, signal) => { expect(signal).toBe(controller.signal); controller.abort(); return request(input, signal); }, mockedJudge, controller.signal);
    expect(mockedJudge).not.toHaveBeenCalled();
    const failed = vi.fn<EvalJudgeCall>().mockRejectedValue(new Error('SECRET_PRIVATE_BODY'));
    const result = await evaluateEssay(testCase, 1, request, failed, new AbortController().signal); expect(failed).toHaveBeenCalledTimes(1); expect(result.judge.status).toBe('failed');
  });
  it('does not accept a fabricated teacher pass or a rewritten success summary', async () => {
    const row = await evaluateEssay(testCase, 1, request, judge, new AbortController().signal);
    const report = { at: new Date().toISOString(), base: 'http://127.0.0.1:3110', codeCommit: '5e91fc6', sourceFingerprint: 'a'.repeat(64), workingTreeDirty: true, model: 'test-model', records: [row], teacherStatus: 'pending', teacherQualityPassed: false, allDeterministicPassed: true };
    expect(essayEvalReportSchema.safeParse(report).success).toBe(true);
    expect(essayEvalReportSchema.safeParse({ ...report, teacherQualityPassed: true }).success).toBe(false);
    expect(essayEvalReportSchema.safeParse({ ...report, allDeterministicPassed: false }).success).toBe(false);
  });
  it('retains only allowlisted API codes and judge failure categories', async () => {
    const http: EvalHttpCall = async () => ({ status: 500, body: { code: 'JSON_PARSE_FAILED', error: 'SECRET_PRIVATE_BODY' } });
    expect(await evaluateEssay(testCase, 1, http, judge, new AbortController().signal)).toMatchObject({ apiCode: 'JSON_PARSE_FAILED', judge: { status: 'skipped' } });
    const unsafe = await evaluateEssay(testCase, 1, async () => ({ status: 500, body: { code: 'SECRET_PRIVATE_BODY' } }), judge, new AbortController().signal);
    expect(unsafe.apiCode).toBeUndefined(); expect(JSON.stringify(unsafe)).not.toContain('SECRET_PRIVATE_BODY');
    const failed = await evaluateEssay(testCase, 1, request, async () => { throw { status: 429, message: 'SECRET_PRIVATE_BODY' }; }, new AbortController().signal);
    expect(failed.judge).toMatchObject({ status: 'failed', failureKind: 'rate_limit' }); expect(JSON.stringify(failed)).not.toContain('SECRET_PRIVATE_BODY');
  });
});
