import { beforeEach, describe, expect, it, vi } from 'vitest';
import { imageRequest } from '@/lib/client/files';
const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), translate: vi.fn(), rotate: vi.fn() };
const canvas = { width: 0, height: 0, getContext: vi.fn(), toDataURL: vi.fn() };
let drawnWidth = 0; let drawnHeight = 0; let load = true;
class MockImage {
  onload: (() => void) | null = null; onerror: (() => void) | null = null;
  naturalWidth = 4000; naturalHeight = 6000;
  set src(value: string) { if (value && load) queueMicrotask(() => this.onload?.()); }
}
const jpeg = () => new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'fixture.jpg', { type: 'image/jpeg' });
beforeEach(() => {
  drawnWidth = 0; drawnHeight = 0; load = true;
  vi.stubGlobal('Image', MockImage); vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-only'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  canvas.getContext.mockReturnValue(context); canvas.toDataURL.mockReturnValue('data:image/jpeg;base64,YQ==');
  context.drawImage.mockImplementation(() => { drawnWidth = canvas.width; drawnHeight = canvas.height; });
});
describe('browser image preparation', () => {
  it('bounds the long edge to 2000px at JPEG80, paints white and releases image memory', async () => {
    expect(await imageRequest(jpeg())).toEqual({ image: 'YQ==', mime: 'image/jpeg' });
    expect(drawnWidth).toBe(1333); expect(drawnHeight).toBe(2000); expect(canvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.8); expect(context.fillStyle).toBe('#ffffff'); expect(context.fillRect).toHaveBeenCalled(); expect(canvas.width).toBe(0); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-only');
  });
  it.each([['image/png', '<svg>not PNG</svg>'], ['image/jpeg', 'not JPEG'], ['image/webp', 'not WEBP'], ['image/gif', 'GIF89a']])('rejects invalid original bytes/mime %s before conversion or upload', async (type, bytes) => {
    await expect(imageRequest(new File([bytes], 'fixture', { type }))).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' }); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('keeps the original 10MB limit and rejects before decoding', async () => {
    await expect(imageRequest(new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' }); expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('cancels a slow decode without leaving the image or object URL alive', async () => {
    load = false; const abort = new AbortController(); const operation = imageRequest(jpeg(), abort.signal); const failure = expect(operation).rejects.toThrow('请求已停止或超时');
    await vi.waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledOnce()); abort.abort(); await failure; expect(URL.revokeObjectURL).toHaveBeenCalledOnce(); expect(context.drawImage).not.toHaveBeenCalled();
  });
});

describe('explicit image orientation', () => {
  it.each([90, 180, 270] as const)('rotates pixels %s degrees without clipping or enlarging', async rotation => {
    await imageRequest(jpeg(), new AbortController().signal, rotation);
    expect(drawnWidth).toBe(rotation === 180 ? 1333 : 2000);
    expect(drawnHeight).toBe(rotation === 180 ? 2000 : 1333);
    expect(context.translate).toHaveBeenCalledWith(drawnWidth / 2, drawnHeight / 2);
    expect(context.rotate).toHaveBeenCalledWith(rotation * Math.PI / 180);
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(MockImage), -1333 / 2, -2000 / 2, 1333, 2000);
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it('does not transform pixels at the default orientation', async () => {
    await imageRequest(jpeg());
    expect(context.rotate).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(MockImage), 0, 0, 1333, 2000);
  });
});
