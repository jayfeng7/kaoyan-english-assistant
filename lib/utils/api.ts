import 'server-only';
import { randomUUID } from 'node:crypto';
import { AppError } from './errors';
import { EssayReviewRequiredError, unreadableHandwritingAssessment } from './essay-safety';
import type { LimitedEssayAssessment } from './essay-safety';
import { checkDailyBudget, checkRateLimit } from './rate-limit';
import { logRequest } from './logger';
import type { ApiContext, ApiHandler, ApiResponse, ErrorCode, RateLimitKind, Schema } from '@/types';

const STATUS: Record<ErrorCode, number> = { ESSAY_REVIEW_REQUIRED: 422, INVALID_INPUT: 400, FILE_TOO_LARGE: 413, UNSUPPORTED_FILE_TYPE: 415, RATE_LIMITED: 429, PDF_PARSE_FAILED: 400, OCR_FAILED: 500, ALL_PROVIDERS_FAILED: 500, JSON_PARSE_FAILED: 500, EXAM_BANK_NOT_FOUND: 404, INTERNAL_ERROR: 500 };

export function createApiContext(): ApiContext { return { id: randomUUID(), startedAt: Date.now() }; }
export function safeError(error: unknown): AppError { return error instanceof AppError ? error : new AppError('INTERNAL_ERROR'); }
export function finishRequest(context: ApiContext, code?: ErrorCode): void {
  logRequest({ id: context.id, durationMs: Math.max(0, Date.now() - context.startedAt), provider: context.provider, wordCount: context.wordCount, code, formatFailure: context.formatFailure, formatIssueCount: context.formatIssueCount });
}
export function clientIp(request: Request): string {
  // Trust only headers that the deployment proxy is expected to overwrite.
  return request.headers.get('x-real-ip')?.trim()
    || request.headers.get('cf-connecting-ip')?.trim()
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'local';
}
export function limitRequest(request: Request, kind: RateLimitKind, context: ApiContext): void {
  const result = checkRateLimit(clientIp(request), kind);
  if (!result.allowed) { context.retryAfter = result.retryAfter; throw new AppError('RATE_LIMITED'); }
  // Total cap across all callers so a leaked public URL cannot drain the model
  // quota by rotating IPs; rejected here before any provider call.
  const budget = checkDailyBudget(kind);
  if (!budget.allowed) { context.retryAfter = budget.retryAfter; throw new AppError('RATE_LIMITED'); }
}
export function errorResponse(error: unknown, context: ApiContext): Response {
  const friendly = safeError(error);
  const body: ApiResponse & { assessment?: LimitedEssayAssessment } = { success: false, error: friendly.message, code: friendly.code };
  if (error instanceof EssayReviewRequiredError) body.assessment = error.assessment;
  else if (friendly.code === 'OCR_FAILED') body.assessment = unreadableHandwritingAssessment();
  return Response.json(body, { status: STATUS[friendly.code], headers: { 'Cache-Control': 'no-store', ...(context.retryAfter ? { 'Retry-After': String(context.retryAfter) } : {}) } });
}
export async function runApi<T>(request: Request, handler: ApiHandler<T>, kind?: RateLimitKind): Promise<Response> {
  const context = createApiContext(); let code: ErrorCode | undefined;
  try {
    if (kind) limitRequest(request, kind, context);
    const { data, provider } = await handler(context);
    context.provider = provider ?? context.provider;
    const body: ApiResponse<T> = { success: true, data, ...(provider ? { provider } : {}) };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { code = safeError(error).code; return errorResponse(error, context); }
  finally { finishRequest(context, code); }
}
export function parseInput<T>(schema: Schema<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  return parsed.data;
}
export async function readJson(request: Request): Promise<unknown> {
  try { return await request.json() as unknown; } catch { throw new AppError('INVALID_INPUT'); }
}
export function validateResult<T>(schema: Schema<T>, input: unknown, code: ErrorCode = 'JSON_PARSE_FAILED'): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError(code);
  return parsed.data;
}
export function countWords(text: string): number { return text.trim().split(/\s+/u).filter(Boolean).length; }
