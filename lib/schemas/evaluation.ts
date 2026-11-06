import { z } from 'zod';
import { errorCodeSchema, providerIdSchema } from './common';
import type { EvalJudgeOutput, EssayEvalRecord, EssayEvalReport, Schema } from '@/types';

const judgment = z.object({ criterion: z.enum(['task_alignment', 'feedback_correctness', 'revision_consistency']), verdict: z.enum(['pass', 'fail', 'uncertain']) }).strict();
export const evalJudgeOutputSchema = z.object({ judgments: z.array(judgment).length(3) }).strict().refine((data) => new Set(data.judgments.map((item) => item.criterion)).size === 3, 'Each criterion must occur once') satisfies Schema<EvalJudgeOutput>;
export const essayEvalRecordSchema = z.object({
  caseId: z.string().regex(/^[a-z0-9-]+$/), attempt: z.number().int().positive(), synthetic: z.boolean(),
  status: z.enum(['structured', 'text_fallback', 'invalid_schema', 'http_error', 'transport_error']), httpStatus: z.number().int().min(0).max(599), durationMs: z.number().nonnegative(),
  provider: providerIdSchema.optional(), score: z.number().min(0).max(20).optional(), band: z.number().int().min(0).max(5).optional(), apiCode: errorCodeSchema.optional(),
  schemaValid: z.boolean(), originalReferencesValid: z.boolean(), commentReferencesValid: z.boolean(),
  referenceIssues: z.array(z.object({ index: z.number().int().positive(), kind: z.enum(['missing_quote', 'non_verbatim', 'case_only', 'ellipsis']) }).strict()),
  issueCodes: z.array(z.enum(['response_schema', 'result_schema', 'original_reference', 'comment_reference', 'http_error', 'request_failed'])),
  judge: z.object({ status: z.enum(['completed', 'invalid', 'failed', 'skipped']), provider: providerIdSchema.optional(), failureKind: z.enum(['timeout', 'rate_limit', 'server_error', 'empty', 'json_parse', 'unknown']).optional(), sameModel: z.literal(true), judgments: z.array(judgment) }).strict(),
  teacherStatus: z.literal('pending'),
}).strict() satisfies Schema<EssayEvalRecord>;
export const essayEvalReportSchema = z.object({ at: z.string().datetime(), codeCommit: z.string().regex(/^[a-f0-9]{7,40}$/), sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/), workingTreeDirty: z.boolean(), base: z.string().url(), model: z.string().min(1), records: z.array(essayEvalRecordSchema).min(1), teacherStatus: z.literal('pending'), allDeterministicPassed: z.boolean(), teacherQualityPassed: z.literal(false) }).strict().superRefine((report, context) => {
  const actual = report.records.every((row) => row.status === 'structured' && row.schemaValid && row.originalReferencesValid && row.commentReferencesValid);
  if (actual !== report.allDeterministicPassed) context.addIssue({ code: 'custom', message: 'Evaluation summary mismatch' });
}) satisfies Schema<EssayEvalReport>;
