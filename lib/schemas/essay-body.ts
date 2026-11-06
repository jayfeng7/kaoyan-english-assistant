import { z } from 'zod';
import type { EssayBodyRanges, EssayBodyRequest, EssayBodySelection, Schema } from '@/types';

export const essayBodyRequestSchema = z.object({ text: z.string().min(1).max(40000).refine(text => text.trim().length > 0) }).strict() satisfies Schema<EssayBodyRequest>;
export const essayBodyRangesSchema = z.object({
  ranges: z.array(z.object({ from: z.number().int().positive(), to: z.number().int().positive() }).strict()).max(50), uncertain: z.boolean(),
}).strict() satisfies Schema<EssayBodyRanges>;
export const essayBodySelectionSchema = z.object({ text: z.string().max(40000), status: z.enum(['ready', 'review']), excludedLines: z.number().int().nonnegative() }).strict().superRefine((value, ctx) => {
  if (value.status === 'ready' && !value.text.trim()) ctx.addIssue({ code: 'custom', path: ['text'], message: '正文为空' });
}) satisfies Schema<EssayBodySelection>;
