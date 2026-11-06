import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OcrScheduleRuntime } from '@/types';

beforeEach(() => { delete (globalThis as typeof globalThis & OcrScheduleRuntime).__kaoyanOcrSchedule; vi.resetModules(); vi.stubEnv('BAIDU_OCR_API_KEY', 'test-ocr-key'); vi.stubEnv('BAIDU_OCR_SECRET_KEY', 'test-ocr-secret'); });
afterEach(() => { vi.useRealTimers(); });

describe('Baidu OCR normalization', () => {
  it('joins lines and preserves UTF-16 offsets for low-confidence highlights', async () => {
    const { normalizeOcr } = await import('@/lib/ocr/baidu');
    const result = normalizeOcr({ words_result: [{ words: 'Study 📖', probability: { average: 0.9 } }, { words: '继续练习', probability: { average: 0.4 } }] });
    expect(result.text).toBe('Study 📖\n继续练习'); expect(result.confidence).toBeCloseTo(0.65);
    expect(result.lowConfidenceWords).toEqual([{ word: '继续练习', confidence: 0.4, start: 9, end: 13 }]);
    expect(result.text.slice(result.lowConfidenceWords[0]!.start, result.lowConfidenceWords[0]!.end)).toBe('继续练习');
  });
  it('uses a strict below-0.6 threshold', async () => {
    const { normalizeOcr } = await import('@/lib/ocr/baidu');
    expect(normalizeOcr({ words_result: [{ words: 'Practice', probability: { average: 0.6 } }] }).lowConfidenceWords).toEqual([]);
  });
  it.each([{ error_code: 17, error_msg: 'vendor details' }, { words_result: [] }, { words_result: [{ words: ' ' , probability: { average: 1 } }] }, { words_result: [{ words: 'No confidence' }] }, { words_result: [{ words: 'Bad value', probability: { average: 2 } }] }])('rejects failed or untrustworthy vendor results', async (raw) => {
    const { normalizeOcr } = await import('@/lib/ocr/baidu');
    expect(() => normalizeOcr(raw)).toThrow('识别暂时失败，请重试或手动输入');
  });
});

describe('Baidu token cache and transport', () => {
  it('does not start token or recognition requests after cancellation', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { recognizeHandwriting } = await import('@/lib/ocr/baidu');
    await expect(recognizeHandwriting('YWJj', AbortSignal.abort())).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(fetcher).not.toHaveBeenCalled();
  });
  it('cancels a waiting upload without poisoning a shared token refresh', async () => {
    let release: (value: Response) => void = () => {};
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(Response.json({ words_result: [{ words: 'Practice.', probability: { average: 0.9 } }] })); vi.stubGlobal('fetch', fetcher);
    const { recognizeHandwriting } = await import('@/lib/ocr/baidu'); const controller = new AbortController();
    const cancelled = recognizeHandwriting('YWJj', controller.signal); const active = recognizeHandwriting('YWJj'); controller.abort();
    await expect(cancelled).rejects.toMatchObject({ code: 'OCR_FAILED' });
    release(Response.json({ access_token: 'test-token', expires_in: 86400 }));
    expect((await active).text).toBe('Practice.'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('forwards cancellation to an active vendor request', async () => {
    let sentSignal: AbortSignal | undefined;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 86400 })).mockImplementationOnce((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      sentSignal = init.signal ?? undefined; sentSignal?.addEventListener('abort', () => reject(new Error('private upstream detail')), { once: true });
    })); vi.stubGlobal('fetch', fetcher);
    const { getAccessToken, recognizeHandwriting } = await import('@/lib/ocr/baidu'); await getAccessToken();
    const controller = new AbortController(); const pending = recognizeHandwriting('YWJj', controller.signal);
    await vi.waitFor(() => expect(sentSignal).toBeDefined()); controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(sentSignal?.aborted).toBe(true);
  });
  it('shares one in-flight token and keeps it in memory until refresh time', async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ access_token: 'test-token', expires_in: 30 * 86400 })); vi.stubGlobal('fetch', fetcher);
    const { getAccessToken } = await import('@/lib/ocr/baidu');
    expect(await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()])).toEqual(['test-token', 'test-token', 'test-token']);
    expect(await getAccessToken()).toBe('test-token'); expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://aip.baidubce.com/oauth/2.0/token'); expect(url).not.toContain('secret');
    expect(String(init.body)).toContain('grant_type=client_credentials'); expect(String(init.body)).toContain('client_id=test-ocr-key');
  });
  it('refreshes one hour before the actual expires_in value', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ access_token: 'test-token', expires_in: 7200 })); vi.stubGlobal('fetch', fetcher);
    const { getAccessToken } = await import('@/lib/ocr/baidu');
    await getAccessToken(); vi.setSystemTime(new Date('2026-01-01T00:59:59Z')); await getAccessToken(); expect(fetcher).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-01-01T01:00:00Z')); await getAccessToken(); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not cache failed token requests', async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('private network failure')).mockResolvedValueOnce(Response.json({ access_token: 'recovered', expires_in: 86400 })); vi.stubGlobal('fetch', fetcher);
    const { getAccessToken } = await import('@/lib/ocr/baidu');
    await expect(getAccessToken()).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(await getAccessToken()).toBe('recovered'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('fails safely without configured credentials or malformed token responses', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ error: 'invalid_client' })); vi.stubGlobal('fetch', fetcher);
    const { getAccessToken } = await import('@/lib/ocr/baidu');
    vi.stubEnv('BAIDU_OCR_SECRET_KEY', ''); await expect(getAccessToken()).rejects.toMatchObject({ code: 'OCR_FAILED' }); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('BAIDU_OCR_SECRET_KEY', 'test-ocr-secret'); await expect(getAccessToken()).rejects.toMatchObject({ code: 'OCR_FAILED' });
  });
  it('requests confidence values and normalizes the recognition response', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 86400 })).mockResolvedValueOnce(Response.json({ words_result: [{ words: 'Practice helps.', probability: { average: 0.95 } }] })); vi.stubGlobal('fetch', fetcher);
    const { recognizeHandwriting } = await import('@/lib/ocr/baidu');
    expect(await recognizeHandwriting('YWJj')).toEqual({ text: 'Practice helps.', confidence: 0.95, lowConfidenceWords: [] });
    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/handwriting?access_token=test-token'); expect(init.method).toBe('POST'); expect(init.signal).toBeInstanceOf(AbortSignal);
    const form = new URLSearchParams(String(init.body)); expect(form.get('image')).toBe('YWJj'); expect(form.get('probability')).toBe('true'); expect(form.get('language_type')).toBe('CHN_ENG');
  });
  it.each([new Response('private upstream error', { status: 500 }), Response.json({ error_code: 216201, error_msg: 'private upstream error' })])('masks upstream recognition failures', async (recognition) => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'test-token', expires_in: 86400 })).mockResolvedValueOnce(recognition); vi.stubGlobal('fetch', fetcher);
    const { recognizeHandwriting } = await import('@/lib/ocr/baidu');
    await expect(recognizeHandwriting('YWJj')).rejects.toMatchObject({ code: 'OCR_FAILED', message: '识别暂时失败，请重试或手动输入' });
  });
});
