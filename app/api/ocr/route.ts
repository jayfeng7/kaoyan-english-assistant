import 'server-only';
import { ocrRequestSchema, ocrResultSchema } from '@/lib/schemas/common';
import { preprocessImage } from '@/lib/ocr/preprocess';
import { recognizeHandwriting } from '@/lib/ocr/baidu';
import { countWords, limitRequest, parseInput, readJson, runApi, validateResult } from '@/lib/utils/api';
import { extractEssayBody } from '@/lib/llm/essay-body';
import { AppError } from '@/lib/utils/errors';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  let started = performance.now(); let upload = 0; let imageMs = 0; let ocr = 0; let bodyMs = 0;
  const response = await runApi(request, async (context) => {
    const raw = await readJson(request);
    upload = performance.now() - started;
    if (typeof raw === 'object' && raw !== null && 'mime' in raw && typeof raw.mime === 'string' && !['image/jpeg', 'image/png', 'image/webp'].includes(raw.mime)) throw new AppError('UNSUPPORTED_FILE_TYPE');
    const input = parseInput(ocrRequestSchema, raw);
    started = performance.now();
    const image = await preprocessImage(input.image, input.mime);
    imageMs = performance.now() - started; started = performance.now();
    const data = validateResult(ocrResultSchema, await recognizeHandwriting(image, request.signal), 'OCR_FAILED');
    ocr = performance.now() - started;
    context.wordCount = countWords(data.text);
    if (input.selectBody) {
      started = performance.now();
      try {
        const selected = await extractEssayBody(data.text, request.signal, () => limitRequest(request, 'llm', context));
        data.body = selected.data; context.provider = selected.provider;
      } catch {
        request.signal.throwIfAborted();
        data.body = { text: '', status: 'review', excludedLines: 0 };
      }
      bodyMs = performance.now() - started;
    }
    return { data };
  }, 'ocr');
  response.headers.set('Server-Timing', `upload;dur=${upload.toFixed(1)}, image;dur=${imageMs.toFixed(1)}, ocr;dur=${ocr.toFixed(1)}, body;dur=${bodyMs.toFixed(1)}`);
  return response;
}
