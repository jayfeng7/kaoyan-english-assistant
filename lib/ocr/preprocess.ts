import 'server-only';
import sharp from 'sharp';
import { imageMimeSchema } from '@/lib/schemas/common';
import { AppError } from '@/lib/utils/errors';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function preprocessImage(image: string, mime: string): Promise<string> {
  if (!imageMimeSchema.safeParse(mime).success) throw new AppError('UNSUPPORTED_FILE_TYPE');
  if (Buffer.byteLength(image, 'base64') > MAX_IMAGE_BYTES) throw new AppError('FILE_TOO_LARGE');
  if (!image || image.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image)) throw new AppError('INVALID_INPUT');
  const input = Buffer.from(image, 'base64');
  try {
    const metadata = await sharp(input).metadata();
    const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };
    const parsedMime = imageMimeSchema.parse(mime);
    if (metadata.format !== formats[parsedMime]) throw new AppError('UNSUPPORTED_FILE_TYPE');
    const processed = await sharp(input).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    return processed.toString('base64');
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('OCR_FAILED');
  }
}
