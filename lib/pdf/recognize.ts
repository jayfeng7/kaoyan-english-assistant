import 'server-only';
import { extractEssayPdf } from './essay';
import { recognizeHandwriting } from '@/lib/ocr/baidu';
import { essayPdfResultSchema } from '@/lib/schemas/essay-bank';
import { ocrResultSchema } from '@/lib/schemas/common';
import { validateResult } from '@/lib/utils/api';
import type { EssayPdfPage, EssayPdfResult } from '@/types';

export async function recognizeEssayPdf(file: File, scan: boolean, signal: AbortSignal, beforeOcr: () => void): Promise<EssayPdfResult> {
  const extracted = await extractEssayPdf(file, scan, signal);
  const pages: EssayPdfPage[] = [];
  for (const page of extracted.pages) {
    signal.throwIfAborted();
    if (page.image) {
      // The trusted extractor already rotates/resizes to <=2000px and encodes JPEG quality 80.
      // Do not download, re-upload or recompress this page through the browser.
      beforeOcr();
      const ocr = validateResult(ocrResultSchema, await recognizeHandwriting(page.image, signal), 'OCR_FAILED');
      pages.push({ number: page.number, method: 'ocr', text: ocr.text, ocr });
    } else pages.push({ number: page.number, method: 'text', text: page.text });
  }
  signal.throwIfAborted();
  return validateResult(essayPdfResultSchema, { pages, total: extracted.total }, 'PDF_PARSE_FAILED');
}
