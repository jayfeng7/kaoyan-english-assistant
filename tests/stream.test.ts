import { describe, expect, it, vi } from 'vitest';
import { streamProvider, streamWithFallback } from '@/lib/llm/stream';
import { ProviderFailure } from '@/lib/llm/client';
import { makeProviders } from './fixtures';
import type { ChatStreamEvent, ProviderStreamCall } from '@/types';

const params = { system: 'Test teacher.', messages: [{ role: 'user' as const, content: 'Test question.' }] };

describe('streaming fallback policy', () => {
  it('emits real incremental text and one provider-bearing done frame', async () => {
    const call = vi.fn<ProviderStreamCall>().mockImplementation(async function* () { yield '第一段'; yield '第二段'; });
    const events: ChatStreamEvent[] = [];
    for await (const event of streamWithFallback(params, { providers: makeProviders(), call })) events.push(event);
    expect(events).toEqual([{ type: 'delta', content: '第一段' }, { type: 'delta', content: '第二段' }, { type: 'done', provider: 'deepseek' }]); expect(call).toHaveBeenCalledTimes(1);
  });
  it.each(['timeout', 'rate_limit', 'server_error'] as const)('switches before any text on %s', async (kind) => {
    const call = vi.fn<ProviderStreamCall>().mockImplementationOnce(async function* () { throw new ProviderFailure(kind); yield ''; }).mockImplementationOnce(async function* () { yield 'Backup answer'; });
    const selected = vi.fn(); const events: ChatStreamEvent[] = [];
    for await (const event of streamWithFallback(params, { providers: makeProviders(), call, onProvider: selected })) events.push(event);
    expect(events.at(-1)).toEqual({ type: 'done', provider: 'siliconflow' }); expect(call).toHaveBeenCalledTimes(2); expect(selected).toHaveBeenCalledWith('siliconflow');
  });
  it('treats whitespace-only streams as empty and does not leak their prefix', async () => {
    const call = vi.fn<ProviderStreamCall>().mockImplementationOnce(async function* () { yield ' \n '; }).mockImplementationOnce(async function* () { yield '有效回答'; });
    const events: ChatStreamEvent[] = [];
    for await (const event of streamWithFallback(params, { providers: makeProviders(), call })) events.push(event);
    expect(events[0]).toEqual({ type: 'delta', content: '有效回答' }); expect(events.at(-1)).toEqual({ type: 'done', provider: 'siliconflow' });
  });
  it('preserves partial output and stops instead of mixing restarted answers', async () => {
    const call = vi.fn<ProviderStreamCall>().mockImplementation(async function* () { yield 'Partial answer'; throw new ProviderFailure('timeout'); });
    const events: ChatStreamEvent[] = [];
    await expect(async () => { for await (const event of streamWithFallback(params, { providers: makeProviders(), call })) events.push(event); }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' });
    expect(events).toEqual([{ type: 'delta', content: 'Partial answer' }]); expect(call).toHaveBeenCalledTimes(1);
  });
  it('does not switch on credential failures', async () => {
    const call = vi.fn<ProviderStreamCall>().mockImplementation(async function* () { throw { status: 401 }; yield ''; });
    await expect(async () => { for await (const event of streamWithFallback(params, { providers: makeProviders(), call })) void event; }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).toHaveBeenCalledTimes(1);
  });
  it('returns the common failure after every configured supplier fails', async () => {
    const call = vi.fn<ProviderStreamCall>().mockImplementation(async function* () { throw new ProviderFailure('server_error'); yield ''; });
    await expect(async () => { for await (const event of streamWithFallback(params, { providers: makeProviders(), call })) void event; }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).toHaveBeenCalledTimes(3);
  });
  it('makes no calls when providers are unconfigured', async () => {
    const call = vi.fn<ProviderStreamCall>();
    await expect(async () => { for await (const event of streamWithFallback(params, { providers: [], call })) void event; }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).not.toHaveBeenCalled();
  });
  it('stops fallback when the client aborts', async () => {
    const controller = new AbortController();
    const call = vi.fn<ProviderStreamCall>().mockImplementation(async function* () { controller.abort(); throw new ProviderFailure('timeout'); yield ''; });
    await expect(async () => { for await (const event of streamWithFallback({ ...params, signal: controller.signal }, { providers: makeProviders(), call })) void event; }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAI-compatible streaming transport', () => {
  it('classifies a deadline abort as timeout so a pre-output failure can switch', async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(deadline.signal);
    const fetcher = vi.fn().mockImplementation((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetcher);
    const operation = (async () => { for await (const chunk of streamProvider(makeProviders()[0]!, params)) void chunk; })();
    const assertion = expect(operation).rejects.toMatchObject({ kind: 'timeout' });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1)); deadline.abort();
    await assertion;
  });
  it('sends all message roles and decodes UTF-8 fragmented across byte chunks', async () => {
    const data = 'data: {"id":"test","choices":[{"index":0,"delta":{"content":"中文回答"}}]}\n\ndata: [DONE]\n\n';
    const bytes = new TextEncoder().encode(data);
    const body = new ReadableStream<Uint8Array>({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })); vi.stubGlobal('fetch', fetcher);
    const messages = [{ role: 'user' as const, content: 'First' }, { role: 'assistant' as const, content: 'Earlier answer' }, { role: 'user' as const, content: 'Follow-up' }];
    const chunks: string[] = [];
    for await (const chunk of streamProvider(makeProviders()[0]!, { ...params, messages })) chunks.push(chunk);
    expect(chunks.join('')).toBe('中文回答');
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    const payload: unknown = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ stream: true, messages: [{ role: 'system', content: params.system }, ...messages] });
  });
});
