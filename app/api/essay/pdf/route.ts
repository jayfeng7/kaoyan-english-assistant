import 'server-only';
import { extractEssayPdf } from '@/lib/pdf/essay';
import { recognizeEssayPdf } from '@/lib/pdf/recognize';
import { essayPdfOptionsSchema } from '@/lib/schemas/essay-bank';
import { runApi, countWords, parseInput, limitRequest } from '@/lib/utils/api';
import { AppError } from '@/lib/utils/errors';
import type { EssayPdfExtractResult, EssayPdfResult } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  const startedAt = performance.now(); let uploadedAt: number | undefined; let ocrStartedAt: number | undefined;
  const response = await runApi<EssayPdfExtractResult | EssayPdfResult>(request, async (context) => {
    const form = await request.formData().catch(() => { throw new AppError('INVALID_INPUT'); });
    uploadedAt = performance.now();
    const file = form.get('file');
    const options = parseInput(essayPdfOptionsSchema, { mode: form.get('mode') ?? 'auto', recognize: form.get('recognize') ?? 'false' });
    if (!(file instanceof File)) throw new AppError('INVALID_INPUT');
    const data = options.recognize === 'true'
      ? await recognizeEssayPdf(file, options.mode === 'scan', request.signal, () => { ocrStartedAt ??= performance.now(); limitRequest(request, 'ocr', context); })
      : await extractEssayPdf(file, options.mode === 'scan', request.signal);
    context.wordCount = countWords(data.pages.map((page) => page.text).join('\n'));
    return { data };
  });
  // Timings only: never include filenames, text, credentials or vendor URLs.
  if (uploadedAt !== undefined) {
    const finishedAt = performance.now();
    response.headers.set('Server-Timing', `upload;dur=${Math.round(uploadedAt - startedAt)}, pdf;dur=${Math.round((ocrStartedAt ?? finishedAt) - uploadedAt)}, ocr;dur=${Math.round(ocrStartedAt === undefined ? 0 : finishedAt - ocrStartedAt)}`);
  }
  return response;
}
