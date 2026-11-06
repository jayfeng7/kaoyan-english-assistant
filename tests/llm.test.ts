import { describe, expect, it, vi } from 'vitest';
import { getProviders } from '@/lib/llm/providers';
import { buildProviderRequest, callProvider, classify, createProviderClient, ProviderFailure } from '@/lib/llm/client';
import { chatWithFallback } from '@/lib/llm/fallback';
import { makeProviders } from './fixtures';
import type { ProviderCall } from '@/types';

describe('provider configuration and OpenAI-compatible transport', () => {
  it('uses only configured providers in the locked order', () => {
    expect(getProviders({})).toEqual([]);
    expect(getProviders({ DEEPSEEK_API_KEY: 'test-only' }).map((provider) => provider.id)).toEqual(['deepseek']);
    expect(getProviders({ OPENROUTER_API_KEY: 'test-only', SILICONFLOW_API_KEY: 'test-only', DEEPSEEK_API_KEY: 'test-only' }).map((provider) => provider.id)).toEqual(['deepseek', 'siliconflow', 'openrouter']);
    expect(getProviders({ DEEPSEEK_API_KEY: ' ', OPENROUTER_API_KEY: 'test-only' }).map((provider) => provider.id)).toEqual(['openrouter']);
    expect(getProviders({ DEEPSEEK_API_KEY: 'test-only' })[0]?.model).toBe('deepseek-flash');
  });
  it('sets a 60-second timeout and disables SDK retry multiplication', () => {
    const client = createProviderClient(makeProviders()[0]!);
    expect(client.timeout).toBe(60_000); expect(client.maxRetries).toBe(0);
  });
  it('sends the exact JSON-mode request through the real SDK with mocked fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 1, model: 'test-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '{"ok":true}' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await callProvider(makeProviders()[0]!, { system: 'Test system.', user: 'Test input.', json: true })).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(typeof init?.body).toBe('string');
    const body: unknown = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: 'test-model', response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, messages: [{ role: 'system', content: 'Test system.' }, { role: 'user', content: 'Test input.' }] });
  });
  it('only disables DeepSeek thinking for structured requests, leaving chat and backups untouched', () => {
    for (const provider of makeProviders()) {
      const json = buildProviderRequest(provider, { system: 'Test.', user: 'Test.', json: true });
      expect(json.thinking).toEqual(provider.id === 'deepseek' ? { type: 'disabled' } : undefined);
      expect(buildProviderRequest(provider, { system: 'Test.', user: 'Test.' })).not.toHaveProperty('thinking');
    }
  });
  it.each([
    [{ status: 429 }, 'rate_limit'], [{ status: 500 }, 'server_error'], [{ status: 503 }, 'server_error'],
    [new ProviderFailure('empty'), 'empty'], [new ProviderFailure('json_parse'), 'json_parse'],
    [Object.assign(new Error('timed out'), { name: 'TimeoutError' }), 'timeout'], [{ status: 401 }, undefined],
  ])('classifies failure without relying on provider error text', (error, expected) => { expect(classify(error)).toBe(expected); });
});

describe('sequential fallback and recoverable text', () => {
  const params = { system: 'Test.', user: 'Test.', json: true };
  it.each(['timeout', 'rate_limit', 'server_error', 'empty', 'json_parse'] as const)('switches on %s and records the successful supplier', async (kind) => {
    const call = vi.fn<ProviderCall>().mockRejectedValueOnce(new ProviderFailure(kind)).mockResolvedValueOnce('{"ok":true}');
    const result = await chatWithFallback(params, { providers: makeProviders(), call });
    expect(result).toEqual({ content: '{"ok":true}', provider: 'siliconflow' });
    expect(call.mock.calls.map(([provider]) => provider.id)).toEqual(['deepseek', 'siliconflow']);
  });
  it('detects actual empty content and actual malformed JSON before switching', async () => {
    const call = vi.fn<ProviderCall>().mockResolvedValueOnce('  ').mockResolvedValueOnce('unstructured answer').mockResolvedValueOnce('{answer:"A",}');
    expect(await chatWithFallback(params, { providers: makeProviders(), call })).toEqual({ content: '{"answer":"A"}', provider: 'openrouter' });
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('repairs valid primary output without calling backups', async () => {
    const call = vi.fn<ProviderCall>().mockResolvedValue('```json\n{answer:"A",}\n```');
    expect(await chatWithFallback(params, { providers: makeProviders(), call })).toEqual({ content: '{"answer":"A"}', provider: 'deepseek' });
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('preserves usable text after all JSON attempts fail', async () => {
    const call = vi.fn<ProviderCall>().mockResolvedValueOnce('可恢复文本').mockRejectedValue(new ProviderFailure('timeout'));
    expect(await chatWithFallback(params, { providers: makeProviders(), call })).toEqual({ content: '可恢复文本', provider: 'deepseek' });
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('returns one friendly code when every supplier is unavailable', async () => {
    const call = vi.fn<ProviderCall>().mockRejectedValue(new ProviderFailure('server_error'));
    await expect(chatWithFallback(params, { providers: makeProviders(), call })).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED', message: '服务暂时不可用，请稍后重试' });
    expect(call).toHaveBeenCalledTimes(3);
  });
  it('does not call unconfigured suppliers or switch on authentication errors', async () => {
    const call = vi.fn<ProviderCall>().mockRejectedValue({ status: 401, message: 'private vendor error' });
    await expect(chatWithFallback(params, { providers: makeProviders(), call })).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' });
    expect(call).toHaveBeenCalledTimes(1);
    call.mockClear();
    await expect(chatWithFallback(params, { providers: [], call })).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' });
    expect(call).not.toHaveBeenCalled();
  });
  it('allows natural-language content when JSON mode is not requested', async () => {
    const call = vi.fn<ProviderCall>().mockResolvedValue('自然中文。');
    expect(await chatWithFallback({ system: 'Test.', user: 'Test.' }, { providers: makeProviders(), call })).toEqual({ content: '自然中文。', provider: 'deepseek' });
  });
});
