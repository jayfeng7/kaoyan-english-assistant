import { z } from 'zod';
import type { Schema, VerificationReport } from '@/types';

export const verificationReportSchema = z.object({
  base: z.string().url(), mode: z.enum(['readonly', 'full']),
  total: z.number().int().nonnegative(), passed: z.number().int().nonnegative(), failed: z.number().int().nonnegative(),
  elapsedMs: z.number().int().nonnegative(), at: z.string().datetime(),
  results: z.array(z.object({ name: z.string().min(1), ok: z.boolean(), status: z.number().int().nonnegative(), ms: z.number().int().nonnegative(), detail: z.record(z.unknown()).optional() }).strict()),
}).strict().superRefine((report, ctx) => {
  if (report.total !== report.results.length || report.passed !== report.results.filter((result) => result.ok).length || report.failed !== report.total - report.passed) ctx.addIssue({ code: 'custom', message: '验收统计与逐项结果不一致' });
}) satisfies Schema<VerificationReport>;
