import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ info: vi.fn(), screenshot: vi.fn(), destroy: vi.fn(), worker: vi.fn(), constructor: vi.fn(), post: vi.fn() }));
vi.mock('pdf-parse', () => ({ PDFParse: class {
  static setWorker = mocks.worker;
  constructor(options: unknown) { mocks.constructor(options); }
  getInfo = mocks.info; getScreenshot = mocks.screenshot; destroy = mocks.destroy;
} }));
vi.mock('@/lib/client/api', async importOriginal => ({ ...await importOriginal<Record<string, unknown>>(), uploadJsonApi: mocks.post }));
import { encodePdfPage, recognizeBrowserPdf } from '@/lib/client/pdf-scan';
import { AppError } from '@/lib/utils/errors';
const canvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };
const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() };
class MockImage {
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  naturalWidth = 2000; naturalHeight = 1000;
  set src(value: string) { if (value) queueMicrotask(() => this.onload?.()); }
}
const file = new File(['%PDF-1.4'], 'sample.pdf', { type: 'application/pdf' });
const ocr = { text: 'Handwritten practice.', confidence: 0.5, lowConfidenceWords: [] };
beforeEach(() => {
  mocks.info.mockResolvedValue({ total: 2, pages: [{ pageNumber: 1, width: 612, height: 792 }, { pageNumber: 2, width: 612, height: 792 }] });
  mocks.screenshot.mockImplementation(async (options: { partial: number[] }) => ({ pages: [{ pageNumber: options.partial[0], dataUrl: 'data:image/png;base64,YQ==' }] }));
  mocks.destroy.mockResolvedValue(undefined); mocks.post.mockResolvedValue({ data: ocr });
  canvas.getContext.mockReturnValue(context); canvas.toDataURL.mockReturnValue('data:image/jpeg;base64,YQ==');
  vi.stubGlobal('Image', MockImage); vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
});
describe('browser scan processing', () => {
  it('combines body selection with the only OCR call for a single-page essay but never selects a multi-page essay page by page', async () => {
    mocks.info.mockResolvedValueOnce({ total: 1, pages: [{ pageNumber: 1, width: 612, height: 792 }] });
    const body = { text: 'He go to school.', status: 'ready', excludedLines: 2 };
    mocks.post.mockResolvedValueOnce({ data: { ...ocr, body } });
    const result = await recognizeBrowserPdf(file, new AbortController().signal, vi.fn(), true);
    expect(result.body).toEqual(body); expect(mocks.post).toHaveBeenLastCalledWith('/api/ocr', expect.objectContaining({ selectBody: true }), expect.anything(), expect.anything());
    mocks.post.mockClear();
    const multi = await recognizeBrowserPdf(file, new AbortController().signal, vi.fn(), true);
    expect(multi.body).toBeUndefined(); expect(mocks.post.mock.calls.every(call => !('selectBody' in call[1]))).toBe(true);
  });
  it('overlaps rendering with recognition while recognition stays serial and in page order', async () => {
    const progress = vi.fn();
    const result = await recognizeBrowserPdf(file, new AbortController().signal, progress);
    expect(result).toEqual({ pages: [{ number: 1, method: 'ocr', text: ocr.text, ocr }, { number: 2, method: 'ocr', text: ocr.text, ocr }], confirmed: false });
    expect(mocks.constructor).toHaveBeenCalledWith(expect.objectContaining({ isEvalSupported: false, verbosity: 0 }));
    expect(mocks.screenshot).toHaveBeenNthCalledWith(1, { partial: [1], scale: 2, imageBuffer: false, imageDataUrl: true });
    // Each page is rendered before its own recognition starts…
    expect(mocks.screenshot.mock.invocationCallOrder[0]).toBeLessThan(mocks.post.mock.invocationCallOrder[0]!);
    expect(mocks.screenshot.mock.invocationCallOrder[1]).toBeLessThan(mocks.post.mock.invocationCallOrder[1]!);
    // …and recognition remains strictly serial in page order (pipelining only overlaps rendering).
    expect(mocks.post.mock.invocationCallOrder[0]).toBeLessThan(mocks.post.mock.invocationCallOrder[1]!);
    expect(mocks.post).toHaveBeenCalledWith('/api/ocr', { image: 'YQ==', mime: 'image/jpeg' }, expect.anything(), expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function), onUploaded: expect.any(Function) }));
    expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8); expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
    expect(mocks.destroy).toHaveBeenCalledOnce(); expect(progress).toHaveBeenCalledWith('正在上传第 2/2 页…');
  });
  it('checks the page limit before making any paid OCR call', async () => {
    mocks.info.mockResolvedValueOnce({ total: 6, pages: [] });
    await expect(recognizeBrowserPdf(file, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it('stops on a failed second page without returning the first page as a complete upload', async () => {
    mocks.post.mockResolvedValueOnce({ data: ocr }).mockRejectedValueOnce(new AppError('OCR_FAILED'));
    await expect(recognizeBrowserPdf(file, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'OCR_FAILED' });
    expect(mocks.post).toHaveBeenCalledTimes(2); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it('stops after cancellation without sending any further OCR request', async () => {
    const controller = new AbortController(); mocks.post.mockImplementationOnce(async () => { controller.abort(); return { data: ocr }; });
    await expect(recognizeBrowserPdf(file, controller.signal, vi.fn())).rejects.toThrow('请求已停止或超时');
    // Rendering may already have started the next page (pipelining), but no second OCR call goes out.
    expect(mocks.post).toHaveBeenCalledOnce(); expect(mocks.screenshot).toHaveBeenCalledTimes(2); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it.each([new Error('private parser detail'), new DOMException('private password detail')])('hides parser errors and destroys its resources', async error => {
    mocks.info.mockRejectedValueOnce(error);
    await expect(recognizeBrowserPdf(file, new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
    expect(mocks.post).not.toHaveBeenCalled(); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it('rejects a malformed PDF before loading its parser', async () => {
    await expect(recognizeBrowserPdf(new File(['broken'], 'bad.pdf'), new AbortController().signal, vi.fn())).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
    expect(mocks.constructor).not.toHaveBeenCalled();
  });
  it('rejects an unavailable canvas with a useful image-upload recovery path', async () => {
    canvas.getContext.mockReturnValueOnce(null);
    await expect(recognizeBrowserPdf(file, new AbortController().signal, vi.fn())).rejects.toThrow('当前浏览器无法处理 PDF 页面');
    expect(mocks.post).not.toHaveBeenCalled(); expect(canvas.width).toBe(0); expect(mocks.destroy).toHaveBeenCalledOnce();
  });
  it('does not accept non-PNG screenshots or an unsupported JPEG encoder', async () => {
    await expect(encodePdfPage('https://untrusted.example/picture', new AbortController().signal)).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
    canvas.toDataURL.mockReturnValueOnce('data:image/png;base64,YQ==');
    await expect(encodePdfPage('data:image/png;base64,YQ==', new AbortController().signal)).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
    expect(mocks.post).not.toHaveBeenCalled(); expect(canvas.width).toBe(0);
  });
  it('never encodes more than a 2000px longest edge and uses an opaque white background', async () => {
    vi.stubGlobal('Image', class extends MockImage { naturalWidth = 4000; naturalHeight = 1000; });
    await encodePdfPage('data:image/png;base64,YQ==', new AbortController().signal);
    expect(context.fillStyle).toBe('#ffffff'); expect(context.fillRect).toHaveBeenCalledWith(0, 0, 2000, 500);
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2000, 500);
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
  it.each(['resolve', 'reject'] as const)('releases a cancelled document after a non-cooperative metadata load eventually %ss', async settlement => {
    const controller = new AbortController(); let finish: (() => void) | undefined;
    mocks.info.mockReturnValueOnce(new Promise((resolve, reject) => {
      finish = () => settlement === 'resolve' ? resolve({ total: 1, pages: [{ pageNumber: 1, width: 612, height: 792 }] }) : reject(new Error('private late load error'));
    }));
    const task = recognizeBrowserPdf(file, controller.signal, vi.fn());
    const failed = expect(task).rejects.toThrow('请求已停止或超时');
    await vi.waitFor(() => expect(mocks.info).toHaveBeenCalledOnce());
    controller.abort(); await failed;
    expect(mocks.destroy).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
    finish?.(); await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    expect(mocks.screenshot).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it('settles cancellation during page rendering and cleans up after that page finishes without uploading it', async () => {
    const controller = new AbortController(); let finish: (() => void) | undefined;
    mocks.screenshot.mockReturnValueOnce(new Promise(resolve => { finish = () => resolve({ pages: [{ pageNumber: 1, dataUrl: 'data:image/png;base64,YQ==' }] }); }));
    const task = recognizeBrowserPdf(file, controller.signal, vi.fn()); const failed = expect(task).rejects.toThrow('请求已停止或超时');
    await vi.waitFor(() => expect(mocks.screenshot).toHaveBeenCalledOnce());
    controller.abort(); await failed; expect(mocks.post).not.toHaveBeenCalled();
    finish?.(); await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    expect(mocks.screenshot).toHaveBeenCalledOnce(); expect(mocks.post).not.toHaveBeenCalled();
  });
  it('does not keep the UI waiting for document cleanup after cancellation', async () => {
    const controller = new AbortController(); let finish: (() => void) | undefined;
    mocks.destroy.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const task = recognizeBrowserPdf(file, controller.signal, vi.fn()); const failed = expect(task).rejects.toThrow('请求已停止或超时');
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    controller.abort(); await failed; finish?.();
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });
});
