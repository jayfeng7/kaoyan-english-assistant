import { z } from 'zod';
import { essayDataSchema } from '@/lib/schemas/storage';
import { createEssayPdf } from '@/lib/pdf/essay-report';
import { createApiContext, clientIp, errorResponse, finishRequest, safeError } from '@/lib/utils/api';
import { createRateLimiter } from '@/lib/utils/rate-limit';
import { AppError } from '@/lib/utils/errors';

export const runtime = 'nodejs';
const limit = createRateLimiter({ max: 10, windowMs: 60_000 });
const schema = z.object({ record: essayDataSchema }).strict();
const MAX_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<Response> {
  const context = createApiContext(); let code;
  try {
    const allowed = limit(clientIp(request));
    if (!allowed.allowed) { context.retryAfter = allowed.retryAfter; throw new AppError('RATE_LIMITED'); }
    const reader = request.body?.getReader();
    if (!reader) throw new AppError('INVALID_INPUT');
    let length = 0; const parts: Uint8Array[] = [];
    try {
      while (true) {
        const item = await reader.read(); if (item.done) break;
        length += item.value.byteLength;
        if (length > MAX_BYTES) { await reader.cancel(); throw new AppError('FILE_TOO_LARGE'); }
        parts.push(item.value);
      }
    } finally { reader.releaseLock(); }
    let input: unknown;
    try { input = JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown; } catch { throw new AppError('INVALID_INPUT'); }
    const parsed = schema.safeParse(input);
    if (!parsed.success || !parsed.data.record.result) throw new AppError('INVALID_INPUT');
    const pdf = await createEssayPdf(parsed.data.record);
    return new Response(pdf as BodyInit, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': "attachment; filename=essay-report.pdf; filename*=UTF-8''%E4%BD%9C%E6%96%87%E6%89%B9%E6%94%B9%E6%8A%A5%E5%91%8A.pdf", 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) { code = safeError(error).code; return errorResponse(error, context); }
  finally { finishRequest(context, code); }
}
