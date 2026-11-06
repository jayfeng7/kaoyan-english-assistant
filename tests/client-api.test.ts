import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeChat, requestApi, ClientFailure } from '@/lib/client/api';
import { sentenceResultSchema } from '@/lib/schemas/sentence';
import { makeSentenceResult } from './fixtures';
import type { ChatStreamEvent } from '@/types';
afterEach(() => vi.useRealTimers());

describe('browser JSON request handling', () => {
  it('validates output and preserves provider metadata', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data: makeSentenceResult(), provider: 'deepseek' })));
    expect(await requestApi('/api/sentence/analyze', sentenceResultSchema)).toEqual({ data: makeSentenceResult(), provider: 'deepseek' });
  });
  it('does not expose arbitrary server error text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: false, error: 'private upstream stack', code: 'ALL_PROVIDERS_FAILED' }, { status: 500 })));
    await expect(requestApi('/api/sentence/analyze', sentenceResultSchema)).rejects.toMatchObject({ message: '服务暂时不可用，请稍后重试' });
  });
  it('rejects malformed successful payloads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, data: { translation: 'missing fields' } })));
    await expect(requestApi('/api/sentence/analyze', sentenceResultSchema)).rejects.toBeInstanceOf(ClientFailure);
  });
  it('provides a safe message when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sensitive transport failure')));
    await expect(requestApi('/api/sentence/analyze', sentenceResultSchema)).rejects.toMatchObject({ message: '网络连接失败，请检查连接后重试' });
  });
  it('keeps timeout recovery appropriate for text features as well as uploads', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>private gateway detail</html>', { status: 524 })));
    await expect(requestApi('/api/sentence/analyze', sentenceResultSchema)).rejects.toMatchObject({ message: '文件传输或服务器响应超时，内容已保留，请检查网络后重试' });
  });
  it('aborts on the client deadline and keeps a friendly draft-preserving error', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('private abort detail', 'AbortError')), { once: true });
    })));
    const request = requestApi('/api/sentence/analyze', sentenceResultSchema);
    const result = expect(request).rejects.toMatchObject({ message: '请求已停止或超时，输入内容已保留' });
    await vi.advanceTimersByTimeAsync(200_000); await result;
  });
});
describe('browser SSE parser', () => {
  const input = { messages: [{ role: 'user' as const, content: 'Test' }] };
  it('handles UTF-8 and CRLF boundaries split across network chunks', async () => {
    const text = 'data: {"type":"delta","content":"中文📖"}\r\n\r\ndata: {"type":"delta","content":"第二段"}\r\n\r\ndata: {"type":"done","provider":"deepseek"}\r\n\r\n';
    const bytes = new TextEncoder().encode(text);
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })));
    const events: ChatStreamEvent[] = []; await consumeChat(input, (event) => events.push(event), new AbortController().signal);
    expect(events).toEqual([{ type: 'delta', content: '中文📖' }, { type: 'delta', content: '第二段' }, { type: 'done', provider: 'deepseek' }]);
  });
  it('keeps received text and rejects a mid-stream error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {"type":"delta","content":"保留文字"}\n\ndata: {"type":"error","message":"vendor raw text","code":"ALL_PROVIDERS_FAILED"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })));
    const events: ChatStreamEvent[] = [];
    await expect(consumeChat(input, (event) => events.push(event), new AbortController().signal)).rejects.toMatchObject({ message: '服务暂时不可用，请稍后重试' }); expect(events[0]).toEqual({ type: 'delta', content: '保留文字' });
  });
  it('detects a truncated stream without a terminal event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('data: {"type":"delta","content":"Partial"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })));
    await expect(consumeChat(input, () => {}, new AbortController().signal)).rejects.toMatchObject({ message: '回答中断，已有文字已保留，请重试' });
  });
  it('rejects invalid frames and pre-stream JSON errors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('data: {"type":"unexpected"}\n\n', { headers: { 'Content-Type': 'text/event-stream' } })).mockResolvedValueOnce(Response.json({ success: false, code: 'RATE_LIMITED' }, { status: 429 })); vi.stubGlobal('fetch', fetcher);
    await expect(consumeChat(input, () => {}, new AbortController().signal)).rejects.toBeInstanceOf(ClientFailure);
    await expect(consumeChat(input, () => {}, new AbortController().signal)).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
});
