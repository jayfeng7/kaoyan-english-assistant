import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { MAX_IMAGE_BYTES, preprocessImage } from '@/lib/ocr/preprocess';

describe('server image preprocessing', () => {
  it('limits the longest edge to 2000px, keeps aspect ratio and outputs JPEG base64', async () => {
    const png = await sharp({ create: { width: 3000, height: 1500, channels: 3, background: 'white' } }).png().toBuffer();
    const result = await preprocessImage(png.toString('base64'), 'image/png');
    expect(result.startsWith('data:')).toBe(false);
    expect(await sharp(Buffer.from(result, 'base64')).metadata()).toMatchObject({ format: 'jpeg', width: 2000, height: 1000 });
  });
  it('does not upscale small WebP images', async () => {
    const image = await sharp({ create: { width: 300, height: 200, channels: 3, background: 'white' } }).webp().toBuffer();
    const result = await preprocessImage(image.toString('base64'), 'image/webp');
    expect(await sharp(Buffer.from(result, 'base64')).metadata()).toMatchObject({ format: 'jpeg', width: 300, height: 200 });
  });
  it('rejects raw input larger than 10MB before decoding or contacting OCR', async () => {
    const image = Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64');
    await expect(preprocessImage(image, 'image/jpeg')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });
  it('rejects unsupported types, data URL prefixes and corrupt files with friendly codes', async () => {
    await expect(preprocessImage('aGVsbG8=', 'image/gif')).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
    await expect(preprocessImage('data:image/jpeg;base64,aGVsbG8=', 'image/jpeg')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(preprocessImage('aGVsbG8=', 'image/jpeg')).rejects.toMatchObject({ code: 'OCR_FAILED', message: '识别暂时失败，请重试或手动输入' });
  });
  it('checks the actual file format against the MIME declaration', async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer();
    await expect(preprocessImage(png.toString('base64'), 'image/jpeg')).rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });
});
