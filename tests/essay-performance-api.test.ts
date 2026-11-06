import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST as ocr } from '@/app/api/ocr/route';
import { POST as correct } from '@/app/api/essay/correct/route';
import { POST as reference } from '@/app/api/essay/reference/route';
import { chatWithFallback } from '@/lib/llm/fallback';
import { recognizeHandwriting } from '@/lib/ocr/baidu';
import { extractEssayBody } from '@/lib/llm/essay-body';
import * as bank from '@/lib/essay-bank';
import * as logger from '@/lib/utils/logger';
import { makeEssayBankItem, makeEssayResult } from './fixtures';
vi.mock('@/lib/llm/fallback', () => ({ chatWithFallback: vi.fn() }));
vi.mock('@/lib/ocr/baidu', () => ({ recognizeHandwriting: vi.fn() }));
vi.mock('@/lib/ocr/preprocess', () => ({ preprocessImage: vi.fn(async () => 'encoded') }));
const answer = 'Learning takes practice. He go to school everyday. At first I felt uncertain, but my teacher helped me to review my mistakes.';
const marked = `Directions: Write an essay.\nStudent essay:\n${answer}\nPage 1 of 1`;
let sequence = 0;
function req(path: string, body: unknown) { return new Request('http://localhost' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-real-ip': `perf-${++sequence}` }, body: JSON.stringify(body) }); }
const input = { type: 'english1', composition: 'big', prompt: 'Write about practice.', essay: 'Learning takes practice.' };
beforeEach(() => { vi.spyOn(logger, 'logRequest').mockImplementation(() => {}); vi.mocked(recognizeHandwriting).mockResolvedValue({ text: marked, confidence: 0.9, lowConfidenceWords: [] }); });
describe('upload and core correction short paths', () => {
  it('returns OCR and exact marked answer in one request without a model or model quota', async () => {
    const response = await ocr(req('/api/ocr', { image: 'encoded', mime: 'image/png', selectBody: true }));
    const result = await response.json();
    expect(result.data.text).toBe(marked); expect(result.data.body).toEqual({ text: answer, status: 'ready', excludedLines: 3 });
    expect(chatWithFallback).not.toHaveBeenCalled(); expect(response.headers.get('server-timing')).toContain('body;dur=');
    expect(JSON.stringify(vi.mocked(logger.logRequest).mock.calls)).not.toMatch(/Learning|Directions/);
  });
  it('preserves the original endpoint for question uploads and older callers', async () => {
    const result = await (await ocr(req('/api/ocr', { image: 'encoded', mime: 'image/png' }))).json();
    expect(result.data.text).toBe(marked); expect(result.data.body).toBeUndefined(); expect(chatWithFallback).not.toHaveBeenCalled();
  });
  it('uses the model for ambiguous layouts and keeps OCR for manual selection on failure', async () => {
    vi.mocked(recognizeHandwriting).mockResolvedValue({ text: 'Unclear paper with several answers.', confidence: 0.7, lowConfidenceWords: [] });
    vi.mocked(chatWithFallback).mockRejectedValueOnce(new Error('PRIVATE_VENDOR'));
    const response = await ocr(req('/api/ocr', { image: 'encoded', mime: 'image/png', selectBody: true }));
    const result = await response.json(); expect(response.status).toBe(200); expect(result.data.body).toMatchObject({ text: '', status: 'review' }); expect(result.data.text).toContain('Unclear paper');
    expect(JSON.stringify(result)).not.toContain('PRIVATE_VENDOR'); expect(chatWithFallback).toHaveBeenCalledOnce();
  });
  it('requests quota only before a needed model call and does not accept multiple answer markers', async () => {
    const before = vi.fn();
    expect((await extractEssayBody(marked, new AbortController().signal, before)).data.text).toBe(answer); expect(before).not.toHaveBeenCalled();
    vi.mocked(chatWithFallback).mockResolvedValueOnce({ content: '{"ranges":[],"uncertain":true}', provider: 'deepseek' });
    expect((await extractEssayBody(marked + '\nStudent essay:\nAnother answer.', new AbortController().signal, before)).data.status).toBe('review'); expect(before).toHaveBeenCalledOnce();
  });
  it('generates a strict core report while default full mode remains strict', async () => {
    const full = makeEssayResult();
    const core = { kind: 'core', scoreCard: full.scoreCard, overallComment: full.overallComment, sentenceAnnotations: full.sentenceAnnotations, suggestions: full.suggestions };
    vi.mocked(chatWithFallback).mockResolvedValue({ content: JSON.stringify(core), provider: 'deepseek' });
    const response = await correct(req('/api/essay/correct', { ...input, report: 'core' })); expect((await response.json()).data).toEqual(core);
    expect((await correct(req('/api/essay/correct', input))).status).toBe(500);
  });
  it('reference uses authoritative bank question, returns no score, and rejects mixed score output', async () => {
    vi.spyOn(bank, 'getEssayBankItem').mockResolvedValue(makeEssayBankItem());
    const full = makeEssayResult(); const ref = { improvedEssay: full.improvedEssay, modelEssay: full.modelEssay, expressions: full.expressions };
    vi.mocked(chatWithFallback).mockResolvedValueOnce({ content: JSON.stringify(ref), provider: 'deepseek' });
    const response = await reference(req('/api/essay/reference', { ...input, source: 'bank', bankId: 'english1-2019-big', prompt: 'FORGED QUESTION' }));
    expect((await response.json()).data).toEqual(ref); expect(vi.mocked(chatWithFallback).mock.calls.at(-1)?.[0].user).not.toContain('FORGED');
    vi.mocked(chatWithFallback).mockResolvedValueOnce({ content: JSON.stringify({ ...ref, scoreCard: full.scoreCard }), provider: 'deepseek' });
    expect((await reference(req('/api/essay/reference', input))).status).toBe(500);
  });
});
