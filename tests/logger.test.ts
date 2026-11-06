import { describe, expect, it, vi } from 'vitest';
import { logRequest } from '@/lib/utils/logger';
import { TEST_ID } from './fixtures';

describe('metadata-only request logging', () => {
  it('drops body, credentials, images and arbitrary additional properties at runtime', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const input = { id: TEST_ID, durationMs: 25, provider: 'deepseek' as const, wordCount: 200, code: 'INVALID_INPUT' as const, essay: 'private essay', apiKey: 'private key', image: 'private base64' };
    logRequest(input);
    expect(write).toHaveBeenCalledWith(JSON.stringify({ id: TEST_ID, durationMs: 25, provider: 'deepseek', wordCount: 200, code: 'INVALID_INPUT' }) + '\n');
    logRequest({ id: 'private text supplied as id', durationMs: Number.NaN });
    expect(write).toHaveBeenLastCalledWith('{}\n');
  });
  it('only records allowlisted format diagnostics and never model or schema messages', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    logRequest({ id: TEST_ID, durationMs: 10, formatFailure: 'schema', formatIssueCount: 2 });
    expect(write).toHaveBeenLastCalledWith(JSON.stringify({ id: TEST_ID, durationMs: 10, formatFailure: 'schema', formatIssueCount: 2 }) + '\n');
    const injected = { id: TEST_ID, durationMs: 10, formatFailure: 'private text', formatIssueCount: Number.NaN, schemaMessage: 'private essay' };
    logRequest(injected as Parameters<typeof logRequest>[0]);
    expect(write).toHaveBeenLastCalledWith(JSON.stringify({ id: TEST_ID, durationMs: 10 }) + '\n');
  });
});
