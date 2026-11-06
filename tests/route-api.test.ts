import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from '@/lib/llm/client';
import * as logger from '@/lib/utils/logger';
import { POST } from '@/app/api/route/route';
import type { ApiResponse, RouterResult } from '@/types';
let counter = 0;
function request(input: unknown): Request { return new Request('http://localhost/api/route', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `route-${++counter}` }, body: JSON.stringify(input) }); }
beforeEach(() => { vi.stubEnv('DEEPSEEK_API_KEY', 'test-only'); vi.stubEnv('SILICONFLOW_API_KEY', ''); vi.stubEnv('OPENROUTER_API_KEY', ''); vi.spyOn(logger, 'logRequest').mockImplementation(() => {}); vi.spyOn(client, 'callProvider').mockResolvedValue('{"agent":"sentence","confidence":0.9,"reason":"用户要求分析句子"}'); });
describe('approved workspace routing contract', () => {
  it('returns a validated intent and provider without running feature analysis', async () => {
    const response = await POST(request({ input: 'Please analyze this sentence.' })); const body = await response.json() as ApiResponse<RouterResult>;
    expect(response.status).toBe(200); expect(body.data?.agent).toBe('sentence'); expect(body.provider).toBe('deepseek'); expect(client.callProvider).toHaveBeenCalledTimes(1);
  });
  it.each(['', ' ', 'a'.repeat(8001)])('rejects invalid routing input', async (input) => { expect((await POST(request({ input }))).status).toBe(400); expect(client.callProvider).not.toHaveBeenCalled(); });
  it('rejects text-only or invalid intent output', async () => {
    vi.mocked(client.callProvider).mockResolvedValueOnce('unstructured output').mockResolvedValueOnce('{"agent":"new-feature","confidence":0.9,"reason":"invalid"}');
    for (let index = 0; index < 2; index++) { const response = await POST(request({ input: 'Test input.' })); expect(response.status).toBe(500); expect(await response.json()).toMatchObject({ code: 'JSON_PARSE_FAILED' }); }
  });
});
