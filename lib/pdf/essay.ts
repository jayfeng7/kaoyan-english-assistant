import 'server-only';
// pdf-parse 对 @napi-rs/canvas 的 require 是运行时动态加载，文件追踪抓不到；
// 显式引入（配合 serverExternalPackages 外部化）让它进入追踪并保留 pnpm 链接。
import '@napi-rs/canvas';
import { PDFParse } from 'pdf-parse';
import sharp from 'sharp';
import { ESSAY_PDF_MAX_BYTES, ESSAY_PDF_MAX_PAGES, essayPdfExtractResultSchema } from '@/lib/schemas/essay-bank';
import { AppError } from '@/lib/utils/errors';
import { validateResult } from '@/lib/utils/api';
import type { EssayPdfExtractPage, EssayPdfExtractResult } from '@/types';

export async function extractEssayPdf(file: File, scan: boolean, signal?: AbortSignal): Promise<EssayPdfExtractResult> {
  signal?.throwIfAborted();
  if (file.size > ESSAY_PDF_MAX_BYTES) throw new AppError('FILE_TOO_LARGE');
  if (file.type !== 'application/pdf') throw new AppError('UNSUPPORTED_FILE_TYPE');
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new AppError('PDF_PARSE_FAILED');
  const parser = new PDFParse({ data, verbosity: 0, isEvalSupported: false });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    signal?.throwIfAborted();
    if (info.total < 1 || info.total > ESSAY_PDF_MAX_PAGES) throw new AppError('INVALID_INPUT');
    const text = scan ? undefined : await parser.getText({ pageJoiner: '' });
    const pages: EssayPdfExtractPage[] = [];
    for (let number = 1; number <= info.total; number++) {
      signal?.throwIfAborted();
      const extracted = text?.pages.find((page) => page.num === number)?.text ?? '';
      if (extracted.trim()) { pages.push({ number, text: extracted }); continue; }
      const bounds = info.pages.find((page) => page.pageNumber === number);
      if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) throw new AppError('PDF_PARSE_FAILED');
      const screenshot = await parser.getScreenshot({ partial: [number], scale: Math.min(2, 2000 / Math.max(bounds.width, bounds.height)), imageDataUrl: false });
      signal?.throwIfAborted();
      const image = screenshot.pages[0];
      if (!image?.data.length) throw new AppError('PDF_PARSE_FAILED');
      const jpeg = await sharp(image.data).rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
      pages.push({ number, text: '', image: jpeg.toString('base64') });
    }
    return validateResult(essayPdfExtractResultSchema, { pages, total: info.total }, 'PDF_PARSE_FAILED');
  } catch (error) { if (error instanceof AppError) throw error; throw new AppError('PDF_PARSE_FAILED'); }
  finally { await parser.destroy().catch(() => undefined); }
}
