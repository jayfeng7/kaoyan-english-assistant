import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadApi, uploadJsonApi } from '@/lib/client/api';
import { ocrResultSchema } from '@/lib/schemas/common';

class MockXhr {
  static instances: MockXhr[] = [];
  upload: { onprogress: ((event: ProgressEvent) => void) | null; onload: (() => void) | null } = { onprogress: null, onload: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  status = 200; timeout = 0; responseText = '';
  open = vi.fn(); setRequestHeader = vi.fn(); send = vi.fn(); abort = vi.fn(() => this.onabort?.());
  constructor() { MockXhr.instances.push(this); }
}
const result = { text: 'Practice.', confidence: 0.9, lowConfidenceWords: [] };
beforeEach(() => { MockXhr.instances = []; vi.stubGlobal('XMLHttpRequest', MockXhr); });
function start(signal = new AbortController().signal) {
  const onProgress = vi.fn(); const onUploaded = vi.fn(); const form = new FormData(); form.set('file', new Blob(['%PDF-1.4']), 'test.pdf');
  const promise = uploadApi('/api/essay/pdf', form, ocrResultSchema, { signal, onProgress, onUploaded });
  return { promise, xhr: MockXhr.instances[0]!, onProgress, onUploaded, form };
}
describe('PDF upload transport', () => {
  it('sends OCR JSON with its original contract and actual upload progress', async () => {
    const onProgress = vi.fn(); const onUploaded = vi.fn(); const input = { image: 'test-only', mime: 'image/jpeg' };
    const promise = uploadJsonApi('/api/ocr', input, ocrResultSchema, { signal: new AbortController().signal, onProgress, onUploaded });
    const xhr = MockXhr.instances[0]!;
    expect(xhr.send).toHaveBeenCalledWith(JSON.stringify(input)); expect(xhr.setRequestHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 80, total: 100 } as ProgressEvent); xhr.upload.onload?.();
    expect(onProgress).toHaveBeenCalledWith(80, 100); expect(onUploaded).toHaveBeenCalledOnce();
    xhr.responseText = JSON.stringify({ success: true, data: result }); xhr.onload?.(); expect((await promise).data).toEqual(result);
  });
  it('reports actual byte progress separately from upload completion and validates the response', async () => {
    const { promise, xhr, onProgress, onUploaded, form } = start();
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/essay/pdf'); expect(xhr.send).toHaveBeenCalledWith(form); expect(xhr.timeout).toBe(200000);
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 10, total: 0 } as ProgressEvent); expect(onProgress).not.toHaveBeenCalled();
    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent); expect(onProgress).toHaveBeenCalledWith(50, 100);
    xhr.upload.onload?.(); expect(onUploaded).toHaveBeenCalledOnce();
    xhr.responseText = JSON.stringify({ success: true, data: result }); xhr.onload?.();
    expect(await promise).toEqual({ data: result, provider: undefined }); expect(xhr.upload.onprogress).toBeNull();
  });
  it('aborts the request immediately and removes cancellation listeners', async () => {
    const controller = new AbortController(); const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const { promise, xhr } = start(controller.signal); controller.abort();
    await expect(promise).rejects.toThrow('请求已停止或超时，输入内容已保留'); expect(xhr.abort).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalled(); expect(xhr.onload).toBeNull();
  });
  it('never sends an already cancelled upload', async () => {
    const { promise } = start(AbortSignal.abort()); await expect(promise).rejects.toThrow('请求已停止或超时'); expect(MockXhr.instances).toHaveLength(0);
  });
  it.each(['onerror', 'ontimeout'] as const)('rejects %s with a safe recoverable message', async (event) => {
    const { promise, xhr } = start(); xhr[event]?.(); await expect(promise).rejects.toThrow(event === 'onerror' ? '网络连接失败' : '请求已停止或超时'); expect(xhr.onload).toBeNull();
  });
  it('keeps known server errors and discards upstream details', async () => {
    const { promise, xhr } = start(); xhr.status = 429; xhr.responseText = JSON.stringify({ success: false, code: 'RATE_LIMITED', error: 'private upstream detail' }); xhr.onload?.();
    await expect(promise).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it.each(['private non-json response', '{"success":true,"data":{"text":4}}'])('rejects malformed results without showing response bodies', async (response) => {
    const { promise, xhr } = start(); xhr.responseText = response; xhr.onload?.(); await expect(promise).rejects.toThrow(/服务返回异常|结果格式有误/);
  });
  it.each([408, 504, 524])('explains gateway timeout %s without exposing the HTML response', async (status) => {
    const { promise, xhr } = start(); xhr.status = status; xhr.responseText = '<html>private gateway detail</html>'; xhr.onload?.();
    await expect(promise).rejects.toThrow('文件传输或服务器响应超时，内容已保留');
  });
  it.each([[413, 'FILE_TOO_LARGE'], [429, 'RATE_LIMITED']] as const)('preserves safe gateway status %s', async (status, code) => {
    const { promise, xhr } = start(); xhr.status = status; xhr.responseText = '<html>private gateway detail</html>'; xhr.onload?.();
    await expect(promise).rejects.toMatchObject({ code });
  });
  it.each([502, 503])('explains origin unavailability %s', async (status) => {
    const { promise, xhr } = start(); xhr.status = status; xhr.responseText = '<html>private gateway detail</html>'; xhr.onload?.();
    await expect(promise).rejects.toThrow('服务器暂时无法连接，内容已保留');
  });
});
