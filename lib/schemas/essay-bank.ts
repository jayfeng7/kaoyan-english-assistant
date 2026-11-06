import { z } from 'zod';
import { compositionTypeSchema, examTypeSchema, ocrResultSchema } from './common';
import type { EssayBankItem, EssayBankFilter, EssayBankList, EssayPdfResult, EssayPdfExtractResult, EssayPdfOptions, Schema } from '@/types';

export const essaySourceSchema = z.enum(['custom', 'bank']);
export const essayYearSchema = z.number().int().min(2005).max(2026);
export const essayBankItemSchema = z.object({
  id: z.string().regex(/^english[12]-20\d{2}-(big|small)$/), type: examTypeSchema, composition: compositionTypeSchema,
  year: essayYearSchema, title: z.string().trim().min(1), directions: z.string().trim().min(1), materialDescription: z.string(),
  materialImage: z.string().regex(/^\/essay-materials\/[a-z0-9-]+\.(png|jpe?g|webp)$/).optional(), source: z.string().min(1), reviewed: z.boolean(),
}).superRefine((item, ctx) => {
  if (item.id !== `${item.type}-${item.year}-${item.composition}`) ctx.addIssue({ code: 'custom', message: '作文题目标识不匹配' });
  if (item.type === 'english2' && item.year < 2010) ctx.addIssue({ code: 'custom', message: '2010 年前为早期旧卷，不属于英语二' });
  if (item.materialImage && !item.materialDescription.trim()) ctx.addIssue({ code: 'custom', message: '图题必须有已核对的文字描述' });
  if ([item.directions, item.materialDescription].filter(Boolean).join('\n\n').length > 500) ctx.addIssue({ code: 'custom', message: '题目超过既定 500 字符上限' });
}) satisfies Schema<EssayBankItem>;
export const essayBankFilterSchema = z.object({ type: examTypeSchema.optional(), composition: compositionTypeSchema.optional(), year: essayYearSchema.optional() }) satisfies Schema<EssayBankFilter>;
export const essayBankListSchema = z.object({ items: z.array(z.object({ id: z.string().min(1), type: examTypeSchema, composition: compositionTypeSchema, year: essayYearSchema, title: z.string().min(1) })), total: z.number().int().nonnegative() }) satisfies Schema<EssayBankList>;
export const ESSAY_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const ESSAY_PDF_MAX_PAGES = 5;
export const essayPdfOptionsSchema = z.object({ mode: z.enum(['auto', 'scan']), recognize: z.enum(['true', 'false']) }) satisfies Schema<EssayPdfOptions>;
export const essayPdfExtractResultSchema = z.object({
  total: z.number().int().min(1).max(ESSAY_PDF_MAX_PAGES),
  pages: z.array(z.object({ number: z.number().int().min(1).max(ESSAY_PDF_MAX_PAGES), text: z.string(), image: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).optional() })).min(1).max(ESSAY_PDF_MAX_PAGES),
}).superRefine((result, ctx) => {
  if (result.pages.length !== result.total) ctx.addIssue({ code: 'custom', message: 'PDF 页数无效' });
  result.pages.forEach((page, index) => { if (page.number !== index + 1 || (!page.text.trim() && !page.image)) ctx.addIssue({ code: 'custom', path: ['pages', index], message: 'PDF 页面无效' }); });
}) satisfies Schema<EssayPdfExtractResult>;
export const essayPdfResultSchema = z.object({
  total: z.number().int().min(1).max(ESSAY_PDF_MAX_PAGES),
  pages: z.array(z.object({ number: z.number().int().min(1).max(ESSAY_PDF_MAX_PAGES), method: z.enum(['text', 'ocr']), text: z.string(), ocr: ocrResultSchema.optional() })).min(1).max(ESSAY_PDF_MAX_PAGES),
}).superRefine((result, ctx) => {
  if (result.pages.length !== result.total || !result.pages.some((page) => page.text.trim())) ctx.addIssue({ code: 'custom', message: 'PDF 页数或内容无效' });
  result.pages.forEach((page, index) => {
    if (page.number !== index + 1 || (page.method === 'ocr' ? !page.ocr || page.ocr.text !== page.text : page.ocr !== undefined)) ctx.addIssue({ code: 'custom', path: ['pages', index], message: 'PDF 页面顺序或识别结果无效' });
  });
}) satisfies Schema<EssayPdfResult>;
