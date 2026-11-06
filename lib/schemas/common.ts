import { z } from 'zod';
import type { OcrRequest, OcrResult, Schema } from '@/types';
import { essayBodySelectionSchema } from './essay-body';

export const examTypeSchema = z.enum(['english1', 'english2']);
export const compositionTypeSchema = z.enum(['big', 'small']);
export const historyTypeSchema = z.enum(['essay', 'sentence', 'exam', 'chat']);
export const providerIdSchema = z.enum(['deepseek', 'siliconflow', 'openrouter']);
export const errorCodeSchema = z.enum(['ESSAY_REVIEW_REQUIRED', 'INVALID_INPUT', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE_TYPE', 'RATE_LIMITED', 'PDF_PARSE_FAILED', 'OCR_FAILED', 'ALL_PROVIDERS_FAILED', 'JSON_PARSE_FAILED', 'EXAM_BANK_NOT_FOUND', 'INTERNAL_ERROR']);
export const uuidSchema = z.string().uuid();
export const timestampSchema = z.number().finite().int().nonnegative();
export const textFallbackSchema = z.object({ text: z.string().min(1) }).strict();
export const imageMimeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export const ocrRequestSchema = z.object({ image: z.string().min(1), mime: imageMimeSchema, selectBody: z.boolean().optional() }) satisfies Schema<OcrRequest>;
export const ocrResultSchema = z.object({
  text: z.string(), confidence: z.number().finite().min(0).max(1),
  body: essayBodySelectionSchema.optional(),
  lowConfidenceWords: z.array(z.object({
    word: z.string().min(1), confidence: z.number().finite().min(0).max(1),
    start: z.number().int().nonnegative(), end: z.number().int().positive(),
  })),
}).superRefine((value, ctx) => {
  value.lowConfidenceWords.forEach((word, index) => {
    if (word.end <= word.start || word.end > value.text.length || value.text.slice(word.start, word.end) !== word.word) {
      ctx.addIssue({ code: 'custom', path: ['lowConfidenceWords', index], message: '低置信度词位置与原文不一致' });
    }
  });
}) satisfies Schema<OcrResult>;

export function boundedText(max: number) {
  return z.string().min(1).max(max).refine((value) => value.trim().length > 0, '请输入内容');
}

export function apiResponseSchema<T>(data: Schema<T>) {
  return z.object({ success: z.boolean(), data: data.optional(), error: z.string().optional(), code: z.string().optional(), provider: providerIdSchema.optional() });
}
