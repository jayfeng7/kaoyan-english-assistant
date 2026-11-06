import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/client/api', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), uploadApi: vi.fn(), uploadJsonApi: vi.fn() }));
vi.mock('@/lib/client/files', () => ({ imageRequest: vi.fn() }));
vi.mock('@/lib/client/pdf-scan', () => ({ recognizeBrowserPdf: vi.fn() }));
import { uploadApi, uploadJsonApi as postApi } from '@/lib/client/api';
import { imageRequest } from '@/lib/client/files';
import { prepareEssayUpload } from '@/lib/client/essay-upload';
import { reviewedText } from '@/lib/client/essay-input';
import { AppError } from '@/lib/utils/errors';
import { ESSAY_PDF_MAX_BYTES } from '@/lib/schemas/essay-bank';
import { recognizeBrowserPdf } from '@/lib/client/pdf-scan';
import type { EssayUploadReview } from '@/types';
const pdf = new File(['%PDF-1.4'], 'test.pdf', { type: 'application/pdf' });
const ocr = { text: 'Scanned text.', confidence: 0.5, lowConfidenceWords: [] };
beforeEach(() => { vi.mocked(postApi).mockResolvedValue({ data: ocr }); vi.mocked(imageRequest).mockResolvedValue({ image: 'test', mime: 'image/png' }); });
describe('writing upload assembly and recoverable drafts', () => {
  it('combines mixed PDF pages in order with OCR metadata and keeps the legacy flag', async () => {
    vi.mocked(uploadApi).mockImplementationOnce(async (_url, _form, _schema, options) => {
      options.onProgress(50, 100); options.onUploaded();
      return { data: { total: 3, pages: [{ number: 1, method: 'text', text: 'Text page.' }, { number: 2, method: 'ocr', text: ocr.text, ocr }, { number: 3, method: 'text', text: 'Last page.' }] } };
    });
    const progress = vi.fn(); const controller = new AbortController(); const review = await prepareEssayUpload(pdf, false, controller.signal, progress);
    expect(review.confirmed).toBe(false); expect(review.pages.map((p) => p.method)).toEqual(['text','ocr','text']); expect(review.pages[1]?.ocr).toEqual(ocr);
    expect(reviewedText(review, 'manual draft')).toBe('Text page.\n\nScanned text.\n\nLast page.');
    expect(postApi).not.toHaveBeenCalled(); expect(uploadApi).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith('正在上传 PDF（50%）…');
    expect(progress).toHaveBeenCalledWith('文件已发出，等待服务器接收并逐页识别…');
  });
  it('routes scans to local page processing and never uploads the original PDF', async () => {
    vi.mocked(recognizeBrowserPdf).mockResolvedValueOnce({ pages: [{ number: 1, method: 'ocr', text: ocr.text, ocr }], confirmed: false });
    const review = await prepareEssayUpload(pdf, true, new AbortController().signal, vi.fn());
    expect(review.confirmed).toBe(false); expect(recognizeBrowserPdf).toHaveBeenCalledOnce(); expect(uploadApi).not.toHaveBeenCalled();
  });
  it('does not return a partially processed scan on OCR failure or silently re-upload the file', async () => {
    vi.mocked(recognizeBrowserPdf).mockRejectedValueOnce(new AppError('OCR_FAILED'));
    await expect(prepareEssayUpload(pdf, true, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'OCR_FAILED' });
    expect(uploadApi).not.toHaveBeenCalled();
    expect(reviewedText(undefined, 'manual draft')).toBe('manual draft');
  });
  it('does not make OCR requests after cancellation', async () => {
    const controller = new AbortController(); vi.mocked(uploadApi).mockImplementationOnce(async () => { controller.abort(); return { data: { total: 1, pages: [{ number: 1, method: 'ocr', text: ocr.text, ocr }] } }; });
    await expect(prepareEssayUpload(pdf, false, controller.signal, vi.fn())).rejects.toHaveProperty('name','AbortError'); expect(postApi).not.toHaveBeenCalled();
  });
  it('uses the existing image endpoint and rejects oversized PDFs before sending them', async () => {
    const review = await prepareEssayUpload(new File(['x'],'image.png',{type:'image/png'}),true,new AbortController().signal,vi.fn()); expect(review.pages[0]?.method).toBe('ocr'); expect(uploadApi).not.toHaveBeenCalled();
    await expect(prepareEssayUpload(new File([new Uint8Array(ESSAY_PDF_MAX_BYTES+1)],'large.pdf',{type:'application/pdf'}),true,new AbortController().signal,vi.fn())).rejects.toMatchObject({code:'FILE_TOO_LARGE'});
  });
  it('turns a local PDF loader error into a recoverable message without uploading the original', async () => {
    vi.mocked(recognizeBrowserPdf).mockRejectedValueOnce(new Error('private module detail'));
    await expect(prepareEssayUpload(pdf, true, new AbortController().signal, vi.fn())).rejects.toThrow('PDF 处理工具加载失败');
    expect(uploadApi).not.toHaveBeenCalled();
  });
  it('bounds the whole scan workflow to 200 seconds and removes its timer and parent listener', async () => {
    vi.useFakeTimers();
    const controller = new AbortController(); const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.mocked(recognizeBrowserPdf).mockImplementationOnce((_file, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('private timeout detail', 'AbortError')), { once: true });
    }));
    try {
      const task = prepareEssayUpload(pdf, true, controller.signal, vi.fn());
      const failed = expect(task).rejects.toThrow('请求已停止或超时，输入内容已保留');
      await vi.advanceTimersByTimeAsync(200_000); await failed;
      expect(vi.getTimerCount()).toBe(0); expect(remove).toHaveBeenCalled(); expect(uploadApi).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('enforces the scan deadline even when an underlying PDF operation ignores the abort signal', async () => {
    vi.useFakeTimers();
    let finish: ((value: EssayUploadReview) => void) | undefined;
    vi.mocked(recognizeBrowserPdf).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    let state = 'pending';
    const task = prepareEssayUpload(pdf, true, new AbortController().signal, vi.fn()).then(() => { state = 'resolved'; }, () => { state = 'rejected'; });
    try {
      await vi.advanceTimersByTimeAsync(200_000);
      expect(state).toBe('rejected');
    } finally {
      finish?.({ pages: [{ number: 1, method: 'ocr', text: ocr.text, ocr }], confirmed: false });
      await task; vi.useRealTimers();
    }
  });
});

it('passes explicit rotation through image preparation and leaves review unconfirmed', async () => {
  const review = await prepareEssayUpload(new File(['x'], 'sideways.png', {type:'image/png'}), true, new AbortController().signal, vi.fn(), false, 270);
  expect(imageRequest).toHaveBeenCalledWith(expect.any(File), expect.any(AbortSignal), 270);
  expect(review.confirmed).toBe(false);
});
