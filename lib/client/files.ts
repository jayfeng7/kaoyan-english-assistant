'use client';
import { AppError } from '@/lib/utils/errors';
import { imageMimeSchema } from '@/lib/schemas/common';
import { ClientFailure } from './api';
import { waitForClientOperation } from './wait';
import type { OcrRequest } from '@/types';
export type ImageRotation = 0 | 90 | 180 | 270;
export async function imageRequest(file: File, signal: AbortSignal = new AbortController().signal, rotation: ImageRotation = 0): Promise<OcrRequest> {
  if (![0, 90, 180, 270].includes(rotation)) throw new AppError('INVALID_INPUT');
  const mime = imageMimeSchema.safeParse(file.type);
  if (!mime.success) throw new AppError('UNSUPPORTED_FILE_TYPE');
  if (file.size > 10 * 1024 * 1024) throw new AppError('FILE_TOO_LARGE');
  signal.throwIfAborted();
  const header = new Uint8Array(await waitForClientOperation(file.slice(0, 12).arrayBuffer(), signal));
  const isJpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isPng = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  const isWebp = new TextDecoder().decode(header.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(header.subarray(8, 12)) === 'WEBP';
  if (!(mime.data === 'image/jpeg' ? isJpeg : mime.data === 'image/png' ? isPng : isWebp)) throw new AppError('UNSUPPORTED_FILE_TYPE');
  const url = URL.createObjectURL(file); const image = new Image(); const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      const clean = () => { image.onload = image.onerror = null; signal.removeEventListener('abort', cancel); };
      const cancel = () => { clean(); image.src = ''; reject(new ClientFailure('请求已停止或超时，输入内容已保留')); };
      image.onload = () => { clean(); resolve(); };
      image.onerror = () => { clean(); reject(new AppError('OCR_FAILED')); };
      signal.addEventListener('abort', cancel, { once: true }); image.src = url;
      if (signal.aborted) cancel();
    });
    signal.throwIfAborted();
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new AppError('OCR_FAILED');
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const sideways = rotation === 90 || rotation === 270;
    canvas.width = sideways ? height : width; canvas.height = sideways ? width : height;
    const context = canvas.getContext('2d');
    if (!context) throw new ClientFailure('当前浏览器无法处理图片，请更新浏览器后重试');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    if (rotation) { context.translate(canvas.width / 2, canvas.height / 2); context.rotate(rotation * Math.PI / 180); context.drawImage(image, -width / 2, -height / 2, width, height); }
    else context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    if (!dataUrl.startsWith('data:image/jpeg;base64,')) throw new AppError('OCR_FAILED');
    signal.throwIfAborted();
    return { image: dataUrl.slice(dataUrl.indexOf(',') + 1), mime: 'image/jpeg' };
  } finally { image.onload = image.onerror = null; image.src = ''; canvas.width = canvas.height = 0; URL.revokeObjectURL(url); }
}
export function downloadJson(text: string): void { const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `考研英语学习记录-${new Date().toISOString().slice(0, 10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
