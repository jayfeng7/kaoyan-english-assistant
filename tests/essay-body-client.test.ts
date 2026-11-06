import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/client/api', async original => ({ ...await original<Record<string, unknown>>(), postApi: vi.fn() }));
vi.mock('@/lib/client/essay-upload', () => ({ prepareEssayUpload: vi.fn() }));
import { prepareEssayBody, prepareEssayFile } from '@/lib/client/essay-body';
import { prepareEssayUpload } from '@/lib/client/essay-upload';
import { postApi } from '@/lib/client/api';
import { reviewedText } from '@/lib/client/essay-input';
import type { EssayUploadReview } from '@/types';
const raw: EssayUploadReview = { pages: [{ number: 1, method: 'text', text: 'Directions: Write a letter.\nDear Tom, I has a question.' }], confirmed: false };
afterEach(() => vi.useRealTimers());
describe('body selection cancellation and safe failure', () => {
  it('uses selection returned with recognition without sending raw text again, including manual-review outcomes', async () => {
    for (const status of ['ready', 'review'] as const) {
      const selected = { ...raw, body: { text: status === 'ready' ? 'He go to school.' : '', status, excludedLines: 1 } };
      expect(await prepareEssayBody(selected, new AbortController().signal)).toBe(selected);
    }
    expect(postApi).not.toHaveBeenCalled();
  });
  it('keeps raw pages but uses only the exact selected body', async () => {
    vi.mocked(postApi).mockResolvedValueOnce({ data: { text: 'Dear Tom, I has a question.', status: 'ready', excludedLines: 1 } });
    const selected = await prepareEssayBody(raw, new AbortController().signal);
    expect(selected.pages).toEqual(raw.pages); expect(reviewedText(selected, '')).toBe('Dear Tom, I has a question.');
    expect(postApi).toHaveBeenCalledWith('/api/essay/body', { text: raw.pages[0]?.text }, expect.anything(), expect.any(AbortSignal));
  });
  it('never grades full paper text when selection fails', async () => {
    vi.mocked(postApi).mockRejectedValueOnce(new Error('network failed'));
    const selected = await prepareEssayBody(raw, new AbortController().signal);
    expect(selected.body?.status).toBe('review'); expect(reviewedText(selected, 'manual')).toBe(''); expect(selected.pages).toEqual(raw.pages);
  });
  it('does not turn cancellation into a new empty review that overwrites the previous draft', async () => {
    const abort = new AbortController(); vi.mocked(postApi).mockImplementationOnce(async () => { abort.abort(); throw new Error('cancelled'); });
    await expect(prepareEssayBody(raw, abort.signal)).rejects.toHaveProperty('name', 'AbortError');
  });
  it('bounds recognition and selection together to the existing 200-second deadline', async () => {
    vi.useFakeTimers(); vi.mocked(prepareEssayUpload).mockResolvedValueOnce(raw); vi.mocked(postApi).mockImplementationOnce(() => new Promise(() => {}));
    const operation = prepareEssayFile(new File(['x'], 'test.png', { type: 'image/png' }), true, new AbortController().signal, vi.fn());
    const failure = expect(operation).rejects.toThrow('识别已停止'); await vi.advanceTimersByTimeAsync(200000); await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
});
