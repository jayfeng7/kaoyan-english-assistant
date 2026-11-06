import 'server-only';
// pdf-parse 对 @napi-rs/canvas 的 require 是运行时动态加载，文件追踪抓不到；
// 显式引入（配合 serverExternalPackages 外部化）让它进入追踪并保留 pnpm 链接。
import '@napi-rs/canvas';
import { PDFParse } from 'pdf-parse';
import { PDF_MAX_BYTES, pdfTextResultSchema } from '@/lib/schemas/exam';
import { AppError } from '@/lib/utils/errors';
import { validateResult } from '@/lib/utils/api';
import type { PdfTextResult } from '@/types';

export async function extractPdfText(file: File): Promise<PdfTextResult> {
  if (file.size > PDF_MAX_BYTES) throw new AppError('FILE_TOO_LARGE');
  if (file.type !== 'application/pdf') throw new AppError('UNSUPPORTED_FILE_TYPE');
  const data = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new AppError('PDF_PARSE_FAILED');
  const parser = new PDFParse({ data, verbosity: 0, isEvalSupported: false });
  try {
    // Page delimiters are presentation metadata, not part of the reading passage.
    const result = await parser.getText({ pageJoiner: '' });
    return validateResult(pdfTextResultSchema, { text: result.text }, 'PDF_PARSE_FAILED');
  } catch {
    throw new AppError('PDF_PARSE_FAILED');
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}
