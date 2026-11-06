import { z } from 'zod';
import { examTypeSchema } from './common';
import type { ExamAnalyzeRequest, ExamBankFilter, ExamBankItem, ExamResult, PdfTextResult, Schema } from '@/types';

export const PDF_MAX_BYTES = 20 * 1024 * 1024;
export const pdfTextResultSchema = z.object({ text: z.string().trim().min(1) }) satisfies Schema<PdfTextResult>;

export const examSourceSchema = z.enum(['bank', 'paste', 'pdf']);
export const examAnalyzeRequestSchema = z.object({
  type: examTypeSchema, source: examSourceSchema, bankId: z.string().optional(), passage: z.string().optional(),
  questionId: z.string().min(1).optional(), question: z.string().optional(), options: z.array(z.string()).optional(), userAnswer: z.string().optional(), translate: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (value.source === 'bank' && !value.bankId?.trim()) ctx.addIssue({ code: 'custom', path: ['bankId'], message: '请选择真题' });
  if (value.source !== 'bank' && !value.passage?.trim()) ctx.addIssue({ code: 'custom', path: ['passage'], message: '请输入文章' });
}) satisfies Schema<ExamAnalyzeRequest>;

export const examResultSchema = z.object({
  passageAnalysis: z.object({
    paragraphs: z.array(z.object({ index: z.number().int().positive(), summary: z.string().min(1), keySentences: z.array(z.string()) })),
    vocabulary: z.array(z.object({ word: z.string().min(1), meaning: z.string().min(1), note: z.string().optional() })),
  }),
  questionAnalysis: z.object({ questionType: z.string().min(1), answer: z.string().min(1), locating: z.string().min(1), reasoning: z.string().min(1) }),
  distractorAnalysis: z.array(z.object({ option: z.string().min(1), text: z.string().min(1), reason: z.string().min(1) })),
  // 模型在 translate=false 时经常省略该字段；缺省按“未生成翻译”处理，由路由按 translate 归一化
  fullTranslation: z.string().nullable().default(null),
}) satisfies Schema<ExamResult>;

export const examBankQuestionSchema = z.object({ id: z.string().min(1), question: z.string().min(1), options: z.array(z.string().min(1)).min(1), answer: z.string().min(1), analysis: z.string().optional() });
export const examBankItemSchema = z.object({ id: z.string().min(1), type: examTypeSchema, year: z.number().int().positive(), section: z.string().min(1), title: z.string().optional(), passage: z.string().min(1), questions: z.array(examBankQuestionSchema).min(1) }) satisfies Schema<ExamBankItem>;
export const examBankFilterSchema = z.object({ type: examTypeSchema.optional(), year: z.coerce.number().int().positive().optional(), q: z.string().optional() }) satisfies Schema<ExamBankFilter>;
