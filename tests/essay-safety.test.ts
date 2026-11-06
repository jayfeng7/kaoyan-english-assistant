import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/essay/correct/route';
import { generateStructured } from '@/lib/llm/structured';
import { essayStreamResponse } from '@/lib/llm/essay-response';
import { essayReviewReason, limitedEssayAssessment } from '@/lib/utils/essay-safety';
import { essayCorrectRequestSchema } from '@/lib/schemas/essay';
import { makeEssayResult } from './fixtures';
import type { EssayCorrectRequest, EssayInputEvidence } from '@/types';

vi.mock('@/lib/llm/structured', () => ({ generateStructured: vi.fn() }));
vi.mock('@/lib/llm/essay-response', () => ({ essayStreamResponse: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logRequest: vi.fn() }));
const base: EssayCorrectRequest = { type: 'english2', composition: 'big', prompt: 'Describe the chart.', essay: 'He go to school. This is a student grammar error, not OCR noise.' };
const evidence: EssayInputEvidence = { origin: 'ocr', reviewed: false, pageCompleteness: 'unknown', bodyStatus: 'ready', confidence: 0.99, uncertainSegments: 0 };
let sequence = 0;
function request(input: EssayCorrectRequest, stream = false) { return new Request('http://localhost/api/essay/correct', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': `safety-${++sequence}`, ...(stream ? { Accept: 'text/event-stream' } : {}) }, body: JSON.stringify(input) }); }
beforeEach(() => { vi.mocked(generateStructured).mockResolvedValue({ data: makeEssayResult(), provider: 'deepseek' }); });

describe('OCR provenance survives the scoring boundary', () => {
  it('does not autocorrect or block typed student grammar errors', () => {
    expect(essayReviewReason(base)).toBeUndefined(); expect(base.essay).toContain('He go');
    expect(essayCorrectRequestSchema.parse({ ...base, inputEvidence: evidence }).inputEvidence).toEqual(evidence);
  });
  it('requires explicit completeness even with 99% recognition confidence', () => {
    expect(essayReviewReason({ ...base, inputEvidence: evidence })).toContain('完整字数与结构');
  });
  it('never treats a known partial page as complete even after text review', () => {
    expect(essayReviewReason({ ...base, inputEvidence: { ...evidence, reviewed: true, pageCompleteness: 'partial' } })).toContain('残页');
  });
  it('allows corrected full text despite the historical OCR confidence', () => {
    expect(essayReviewReason({ ...base, inputEvidence: { ...evidence, confidence: 0.3, reviewed: true, pageCompleteness: 'full' } })).toBeUndefined();
  });
  it.each(['[?]', '☰'])('requires unresolved marker %s to be checked, even after confirmation', marker => {
    expect(essayReviewReason({ ...base, essay: `He ${marker} to school.`, inputEvidence: { ...evidence, reviewed: true, pageCompleteness: 'full' } })).toContain('识别噪声');
  });
  it('rejects malformed or out-of-range provenance fields', () => {
    expect(essayCorrectRequestSchema.safeParse({ ...base, inputEvidence: { ...evidence, confidence: 2 } }).success).toBe(false);
    expect(essayCorrectRequestSchema.safeParse({ ...base, inputEvidence: { ...evidence, reviewed: 'yes' } }).success).toBe(false);
  });
});

describe('JSON and SSE both stop before provider invocation', () => {
  it.each([false, true])('returns a five-part limited assessment without a model call (SSE=%s)', async stream => {
    const response = await POST(request({ ...base, inputEvidence: evidence }, stream));
    const raw = await response.json();
    expect(response.status).toBe(422); expect(raw.code).toBe('ESSAY_REVIEW_REQUIRED');
    expect(raw.assessment.transcript).toBe(base.essay); expect(raw.assessment.score).toBeNull();
    expect(raw.assessment.confidence).toBeLessThanOrEqual(.5); expect(raw.assessment.limitations.join(' ')).toContain('完整字数与结构');
    expect(raw.assessment.suggestions.length).toBeGreaterThanOrEqual(2); expect(Object.keys(raw.assessment.feedback)).toHaveLength(7);
    expect(vi.mocked(generateStructured).mock.calls.length).toBe(0); expect(vi.mocked(essayStreamResponse).mock.calls.length).toBe(0);
  });
  it('continues normal scoring for reviewed full text', async () => {
    const response = await POST(request({ ...base, inputEvidence: { ...evidence, reviewed: true, pageCompleteness: 'full' } }));
    expect(response.status).toBe(200); expect(vi.mocked(generateStructured).mock.calls.length).toBe(1);
    const sent = JSON.parse(vi.mocked(generateStructured).mock.calls[0]![0].user);
    expect(sent.essay).toBe(base.essay); expect(sent.inputEvidence).toBeUndefined();
  });
  it('does not invent error-free feedback when it cannot assess', () => {
    const report = limitedEssayAssessment(base, '仅提供残页。');
    expect(Object.values(report.feedback).every(text => !text.includes('未发现明显问题'))).toBe(true);
    expect(report.task_identification.basis).toBe('user_supplied_not_image_identification');
  });
});
