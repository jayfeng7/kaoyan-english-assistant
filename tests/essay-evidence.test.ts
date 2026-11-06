import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/essay/correct/route';
import { chatWithFallback } from '@/lib/llm/fallback';
import { streamEssay } from '@/lib/llm/essay-stream';
import { groundedEssaySchema } from '@/lib/schemas/essay-evidence';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import { annotationHasEssayEvidence, scoreHasEssayEvidence } from '@/lib/utils/essay-evidence';
import { makeEssayResult } from './fixtures';
import type { EssayStreamEvent } from '@/types';
vi.mock('@/lib/llm/fallback', () => ({ chatWithFallback: vi.fn() }));
vi.mock('@/lib/llm/essay-stream', () => ({ streamEssay: vi.fn() }));
vi.mock('@/lib/utils/logger', () => ({ logRequest: vi.fn() }));
const essay = 'Learning takes practice.';
const input = { type: 'english1', composition: 'big', essay, prompt: 'Write about regular practice.' };
let sequence = 0;
function request(stream = false) {
  return new Request('http://localhost/api/essay/correct', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-real-ip': `grounding-${++sequence}`, ...(stream ? { Accept: 'text/event-stream' } : {}) }, body: JSON.stringify(input) });
}
beforeEach(() => {
  vi.mocked(chatWithFallback).mockResolvedValue({ content: JSON.stringify(makeEssayResult()), provider: 'deepseek' });
});

describe('literal student evidence', () => {
  it('accepts line wrapping without correcting spelling or case', () => {
    const schema = groundedEssaySchema(createEssayResultSchema('english1', 'big'), 'Learning\ntakes   practice.');
    expect(schema.safeParse(makeEssayResult()).success).toBe(true);
    expect(annotationHasEssayEvidence({ ...makeEssayResult().sentenceAnnotations[0]!, original: 'learning takes practice.' }, essay)).toBe(false);
  });
  it.each(['invented sentence', 'rewrite as original', 'prompt as original'])('rejects %s', scenario => {
    const report = makeEssayResult();
    report.sentenceAnnotations[0]!.original = scenario === 'invented sentence' ? 'Students should always study hard.' : scenario === 'rewrite as original' ? report.improvedEssay : input.prompt;
    expect(groundedEssaySchema(createEssayResultSchema('english1', 'big'), essay).safeParse(report).success).toBe(false);
  });
  it('rejects invented quoted errors even when the displayed original is real', () => {
    const annotation = { ...makeEssayResult().sentenceAnnotations[0]!, type: 'problem' as const, comment: '「He go」需要修改谓语。' };
    expect(annotationHasEssayEvidence(annotation, essay)).toBe(false);
  });
  it('requires a literal score reason, rejecting generic and prompt-only rationale', () => {
    for (const bandReason of ['语言比较好，内容完整。', '根据「Write about regular practice.」评分。']) {
      expect(scoreHasEssayEvidence({ ...makeEssayResult().scoreCard, bandReason }, essay)).toBe(false);
    }
  });
});

describe('JSON and SSE grounding boundaries', () => {
  it('keeps grounded JSON reports valid', async () => {
    const response = await POST(request()); expect(response.status).toBe(200);
    expect((await response.json()).data.scoreCard.score).toBe(14);
  });
  it('returns a safe failure without the invented text or a score for ungrounded JSON', async () => {
    const report = makeEssayResult(); report.sentenceAnnotations[0]!.original = 'INVENTED_PRIVATE_SENTENCE';
    vi.mocked(chatWithFallback).mockResolvedValue({ content: JSON.stringify(report), provider: 'deepseek' });
    const response = await POST(request()); const raw = await response.text();
    expect(response.status).toBe(500); expect(raw).toContain('JSON_PARSE_FAILED'); expect(raw).not.toMatch(/INVENTED_PRIVATE_SENTENCE|scoreCard/);
  });
  it('stops an ungrounded streaming annotation before it reaches the client', async () => {
    vi.mocked(streamEssay).mockImplementationOnce(async function* (): AsyncGenerator<EssayStreamEvent> {
      yield { type: 'annotation', annotation: { ...makeEssayResult().sentenceAnnotations[0]!, original: 'INVENTED_PRIVATE_SENTENCE' } };
      yield { type: 'done', data: makeEssayResult(), provider: 'deepseek' };
    });
    const raw = await (await POST(request(true))).text();
    expect(raw).toContain('JSON_PARSE_FAILED'); expect(raw).not.toMatch(/INVENTED_PRIVATE_SENTENCE|"type":"annotation"|"type":"done"/);
  });
  it('validates the final SSE report even if an upstream generator skips validation', async () => {
    const report = makeEssayResult(); report.scoreCard.bandReason = 'An unsupported generic score.';
    vi.mocked(streamEssay).mockImplementationOnce(async function* (): AsyncGenerator<EssayStreamEvent> { yield { type: 'done', data: report, provider: 'deepseek' }; });
    const raw = await (await POST(request(true))).text();
    expect(raw).toContain('JSON_PARSE_FAILED'); expect(raw).not.toContain('"type":"done"');
  });
});
