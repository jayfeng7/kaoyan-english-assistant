import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeEssay } from '@/lib/client/essay-stream';
import { makeEssayResult } from './fixtures';
import type { EssayStreamEvent } from '@/types';
const input = { type: 'english1' as const, composition: 'big' as const, prompt: 'Synthetic question', essay: 'Learning takes practice.' };
const frame = (event: unknown) => `data: ${JSON.stringify(event)}\r\n\r\n`;
function response(text: string) { const bytes = new TextEncoder().encode(text); return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } }), { headers: { 'Content-Type': 'text/event-stream' } }); }
afterEach(() => vi.useRealTimers());
describe('essay streaming client', () => {
  it('delivers a checked early score but still requires done before returning a savable report', async () => {
    const score = { type: 'score', scoreCard: makeEssayResult().scoreCard };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(frame(score) + frame({ type: 'error', code: 'JSON_PARSE_FAILED', message: 'private detail' }))));
    const events: EssayStreamEvent[] = [];
    await expect(consumeEssay(input, event => events.push(event), new AbortController().signal)).rejects.toThrow();
    expect(events).toEqual([score]);
  });
  it('rejects a score preview from another exam scale before showing it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(frame({ type: 'score', scoreCard: makeEssayResult().scoreCard }))));
    const received = vi.fn();
    await expect(consumeEssay({ ...input, composition: 'small' }, received, new AbortController().signal)).rejects.toThrow('批改格式异常'); expect(received).not.toHaveBeenCalled();
  });
  it('accepts explicit text feedback for history and follow-up without inventing a score', async () => {
    const data = { text: '未完成有效评分；可以继续讨论原文。' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(frame({ type: 'done', data, provider: 'deepseek' }))));
    expect(await consumeEssay(input, () => {}, new AbortController().signal)).toEqual({ data, provider: 'deepseek' });
  });
  it('renders UTF-8 previews early and returns only a validated result for persistence', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(frame({ type: 'preview', field: 'overallComment', text: '中文📖' }) + frame({ type: 'done', data: makeEssayResult(), provider: 'deepseek' }))); vi.stubGlobal('fetch', fetcher);
    const events: EssayStreamEvent[] = [];
    expect(await consumeEssay(input, event => events.push(event), new AbortController().signal)).toEqual({ data: makeEssayResult(), provider: 'deepseek' }); expect(events[0]).toMatchObject({ text: '中文📖' });
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { Accept: 'text/event-stream' } });
  });
  it('preserves received previews but rejects a missing terminal result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(frame({ type: 'preview', field: 'modelEssay', text: 'Partial essay' }))));
    const events: EssayStreamEvent[] = [];
    await expect(consumeEssay(input, event => events.push(event), new AbortController().signal)).rejects.toThrow('批改中断'); expect(events).toHaveLength(1);
  });
  it('revalidates the exam-specific maximum and rejects malicious fields or invalid final data', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(frame({ type: 'preview', field: 'scoreCard', text: '20' }))).mockResolvedValueOnce(response(frame({ type: 'done', data: makeEssayResult(), provider: 'deepseek' }))); vi.stubGlobal('fetch', fetcher);
    await expect(consumeEssay(input, () => {}, new AbortController().signal)).rejects.toThrow('批改格式异常');
    await expect(consumeEssay({ ...input, composition: 'small' }, () => {}, new AbortController().signal)).rejects.toThrow('批改格式异常');
  });
  it('keeps gateway and stream failures safe without exposing upstream text', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('private gateway stack', { status: 524 })).mockResolvedValueOnce(response(frame({ type: 'error', code: 'ALL_PROVIDERS_FAILED', message: 'private secret' }))); vi.stubGlobal('fetch', fetcher);
    await expect(consumeEssay(input, () => {}, new AbortController().signal)).rejects.toThrow('服务器响应超时');
    await expect(consumeEssay(input, () => {}, new AbortController().signal)).rejects.toThrow('服务暂时不可用');
  });
  it('aborts a stalled body at 200 seconds and cleans up the reader', async () => {
    vi.useFakeTimers(); const cancel = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({ cancel }), { headers: { 'Content-Type': 'text/event-stream' } })));
    const operation = consumeEssay(input, () => {}, new AbortController().signal);
    const failure = expect(operation).rejects.toThrow('批改已停止或超时'); await vi.advanceTimersByTimeAsync(200_000); await failure; expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
