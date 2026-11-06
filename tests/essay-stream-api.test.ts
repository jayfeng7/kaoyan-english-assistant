import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/essay/correct/route';
import { streamEssay } from '@/lib/llm/essay-stream';
import * as bank from '@/lib/essay-bank';
import * as logger from '@/lib/utils/logger';
import { AppError } from '@/lib/utils/errors';
import { makeEssayBankItem, makeEssayResult } from './fixtures';
import type { EssayStreamEvent } from '@/types';
vi.mock('@/lib/llm/essay-stream', () => ({ streamEssay: vi.fn() }));
let sequence = 0;
const input = { type: 'english1', composition: 'big', prompt: 'Synthetic question', essay: 'Learning takes practice.' };
function request(body: unknown, signal?: AbortSignal, ip = `essay-stream-${++sequence}`) { return new Request('http://localhost/api/essay/correct', { method: 'POST', headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body), signal }); }
beforeEach(() => {
  vi.spyOn(logger, 'logRequest').mockImplementation(() => {});
  vi.spyOn(bank, 'getEssayBankItem').mockResolvedValue(makeEssayBankItem());
  vi.mocked(streamEssay).mockImplementation(async function* (_params, _schema, context) {
    context.provider = 'deepseek';
    yield { type: 'status', stage: 'generating' };
    yield { type: 'preview', field: 'overallComment', text: 'Synthetic preview' };
    yield { type: 'done', data: makeEssayResult(), provider: 'deepseek' };
  });
});
describe('optional essay SSE contract', () => {
  it('returns SSE with safe caching and logs once without essay or preview text', async () => {
    const response = await POST(request(input)); expect(response.status).toBe(200); expect(response.headers.get('Content-Type')).toContain('text/event-stream'); expect(response.headers.get('Cache-Control')).toBe('no-store, no-transform'); expect(response.headers.get('Vary')).toBe('Accept');
    const text = await response.text(); expect(text).toContain('"type":"preview"'); expect(text).toContain('"type":"done"'); expect(logger.logRequest).toHaveBeenCalledOnce();
    expect(JSON.stringify(vi.mocked(logger.logRequest).mock.calls)).not.toMatch(/Learning|Synthetic preview/);
    expect(JSON.parse(vi.mocked(streamEssay).mock.calls[0]?.[0].user ?? '{}').wordCount).toBe(3);
  });
  it('keeps validation errors as the existing JSON envelope before streaming starts', async () => {
    const response = await POST(request({ ...input, essay: 'x'.repeat(8001) })); expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ success: false, code: 'INVALID_INPUT' }); expect(streamEssay).not.toHaveBeenCalled();
  });
  it('still uses the authoritative bank question and rejects mismatched exam types', async () => {
    const response = await POST(request({ ...input, source: 'bank', bankId: 'english1-2019-big', prompt: 'Replaced client question' })); await response.text();
    const sent = JSON.parse(vi.mocked(streamEssay).mock.calls[0]?.[0].user ?? '{}') as Record<string, unknown>;
    expect(sent.prompt).toContain('Write about practice.'); expect(sent.prompt).not.toContain('Replaced client question');
    expect((await POST(request({ ...input, type: 'english2', source: 'bank', bankId: 'english1-2019-big' }))).status).toBe(400);
  });
  it('emits a safe error and no done after a partial interruption', async () => {
    vi.mocked(streamEssay).mockImplementationOnce(async function* (): AsyncGenerator<EssayStreamEvent> { yield { type: 'preview', field: 'modelEssay', text: 'Draft' }; throw new Error('private vendor stack'); });
    const response = await POST(request(input)); const text = await response.text(); expect(text).toContain('"type":"error"'); expect(text).not.toMatch(/private|stack|"type":"done"/); expect(logger.logRequest).toHaveBeenCalledOnce();
  });
  it('cancels the provider signal when the reader leaves', async () => {
    let providerSignal: AbortSignal | undefined;
    vi.mocked(streamEssay).mockImplementationOnce(async function* (params): AsyncGenerator<EssayStreamEvent> { providerSignal = params.signal; yield { type: 'status', stage: 'generating' }; });
    const response = await POST(request(input)); const reader = response.body!.getReader(); await reader.read(); await reader.cancel(); expect(providerSignal?.aborted).toBe(true); expect(logger.logRequest).toHaveBeenCalledOnce();
  });
  it('uses the existing rate-limit bucket before calling the model', async () => {
    const ip = `same-essay-stream-${++sequence}`;
    let limited: Response | undefined;
    for (let index = 0; index < 21; index++) { const response = await POST(request(input, undefined, ip)); if (response.status === 429) { limited = response; break; } await response.text(); }
    expect(limited?.status).toBe(429); expect(await limited?.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('does not expose known application errors as raw exceptions', async () => {
    vi.mocked(streamEssay).mockImplementationOnce(async function* () { throw new AppError('JSON_PARSE_FAILED'); yield { type: 'status', stage: 'generating' }; });
    const text = await (await POST(request(input))).text(); expect(text).toContain('"code":"JSON_PARSE_FAILED"'); expect(text).not.toContain('Error:');
  });
  it('retains format-failure metadata when readable feedback finishes without a valid score', async () => {
    vi.mocked(streamEssay).mockImplementationOnce(async function* (_params, _schema, context): AsyncGenerator<EssayStreamEvent> {
      context.formatFailure = 'schema'; context.formatIssueCount = 2;
      yield { type: 'done', data: { text: '未完成有效评分，可以继续讨论原文。' }, provider: 'deepseek' };
    });
    const text = await (await POST(request(input))).text();
    expect(text).toContain('"type":"done"'); expect(text).not.toContain('scoreCard');
    expect(logger.logRequest).toHaveBeenCalledWith(expect.objectContaining({ code: 'JSON_PARSE_FAILED', formatFailure: 'schema', formatIssueCount: 2 }));
    expect(JSON.stringify(vi.mocked(logger.logRequest).mock.calls)).not.toContain('讨论原文');
  });
});
