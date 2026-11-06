import { z } from 'zod';
import { compositionTypeSchema, examTypeSchema, historyTypeSchema, ocrResultSchema, providerIdSchema, textFallbackSchema, timestampSchema, uuidSchema } from './common';
import { chatMessageSchema } from './chat';
import { createEssayReportSchema, essayReportSchema } from './essay';
import { essaySourceSchema, essayYearSchema } from './essay-bank';
import { sentenceResultSchema } from './sentence';
import { examResultSchema, examSourceSchema } from './exam';
import type { AppSettings, BackupData, ChatData, EssayData, ExamData, HistoryRecord, Schema, SentenceData } from '@/types';

const snapshotFields = { provider: providerIdSchema.optional(), followUps: z.array(chatMessageSchema).optional() };
export const essayDataSchema = z.object({
  id: uuidSchema, type: examTypeSchema, composition: compositionTypeSchema, title: z.string(), prompt: z.string(), essay: z.string().min(1),
  wordCount: z.number().int().nonnegative(), ocrResult: ocrResultSchema.optional(), createdAt: timestampSchema,
  source: essaySourceSchema.optional(), bankId: z.string().optional(), year: essayYearSchema.optional(), sourceLabel: z.string().optional(),
  result: z.union([essayReportSchema, textFallbackSchema]).optional(), ...snapshotFields,
}).superRefine((value, ctx) => {
  if (value.result && !('text' in value.result)) {
    const parsed = createEssayReportSchema(value.type, value.composition).safeParse(value.result);
    if (!parsed.success) ctx.addIssue({ code: 'custom', path: ['result'], message: '作文评分与题型不一致' });
  }
}) satisfies Schema<EssayData>;
export const sentenceDataSchema = z.object({ id: uuidSchema, sentence: z.string().min(1), createdAt: timestampSchema, result: z.union([sentenceResultSchema, textFallbackSchema]).optional(), ...snapshotFields }) satisfies Schema<SentenceData>;
export const examDataSchema = z.object({
  id: uuidSchema, type: examTypeSchema, source: examSourceSchema, bankId: z.string().optional(), questionId: z.string().optional(), passage: z.string().min(1), question: z.string().optional(),
  options: z.array(z.string()).optional(), userAnswer: z.string().optional(), sourceLabel: z.string().optional(), createdAt: timestampSchema,
  result: z.union([examResultSchema, textFallbackSchema]).optional(), ...snapshotFields,
}) satisfies Schema<ExamData>;
export const chatDataSchema = z.object({ id: uuidSchema, title: z.string(), messages: z.array(chatMessageSchema), createdAt: timestampSchema, updatedAt: timestampSchema }) satisfies Schema<ChatData>;

export const historyRecordSchema = z.object({
  id: uuidSchema, type: historyTypeSchema, title: z.string(), preview: z.string().refine((value) => Array.from(value).length <= 80, '预览最多 80 字'),
  createdAt: timestampSchema, updatedAt: timestampSchema, data: z.unknown(),
}).transform((record, ctx) => {
  const schemas = { essay: essayDataSchema, sentence: sentenceDataSchema, exam: examDataSchema, chat: chatDataSchema };
  const result = schemas[record.type].safeParse(record.data);
  if (!result.success || record.updatedAt < record.createdAt) {
    ctx.addIssue({ code: 'custom', path: ['data'], message: '历史快照结构或标识不一致' });
    return z.NEVER;
  }
  return { ...record, data: result.data };
}) satisfies Schema<HistoryRecord>;

export const appSettingsSchema = z.object({
  provider: z.enum(['auto', 'deepseek', 'siliconflow', 'openrouter']), essayType: examTypeSchema, composition: compositionTypeSchema,
  defaultFullTranslation: z.boolean(), fontSize: z.number().finite().positive(),
}) satisfies Schema<AppSettings>;
export const backupDataSchema = z.object({ history: z.array(historyRecordSchema), settings: appSettingsSchema }).strict() satisfies Schema<BackupData>;
