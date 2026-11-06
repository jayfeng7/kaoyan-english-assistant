import 'server-only';
import { errorCodeSchema, providerIdSchema, uuidSchema } from '@/lib/schemas/common';
import type { RequestLog } from '@/types';

export function logRequest(input: RequestLog): void {
  const entry: Partial<RequestLog> = {};
  if (uuidSchema.safeParse(input.id).success) entry.id = input.id;
  if (Number.isFinite(input.durationMs) && input.durationMs >= 0) entry.durationMs = input.durationMs;
  if (input.provider && providerIdSchema.safeParse(input.provider).success) entry.provider = input.provider;
  if (input.wordCount !== undefined && Number.isSafeInteger(input.wordCount) && input.wordCount >= 0) entry.wordCount = input.wordCount;
  if (input.code && errorCodeSchema.safeParse(input.code).success) entry.code = input.code;
  if (input.formatFailure === 'json' || input.formatFailure === 'schema') entry.formatFailure = input.formatFailure;
  if (Number.isSafeInteger(input.formatIssueCount) && input.formatIssueCount! >= 0 && input.formatIssueCount! <= 10000) entry.formatIssueCount = input.formatIssueCount;
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
