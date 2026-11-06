import { z } from 'zod';
import { examBankItemSchema } from './exam';
import { providerIdSchema, timestampSchema } from './common';
import type { BaiduOcrResponse, BaiduToken, ExamBankList, HealthData, Schema } from '@/types';

export const healthDataSchema = z.object({ status: z.literal('ok'), providers: z.array(providerIdSchema), ocr: z.boolean(), examBankCount: z.number().int().nonnegative(), time: timestampSchema }) satisfies Schema<HealthData>;
export const examBankListSchema = z.object({ items: z.array(examBankItemSchema.pick({ id: true, type: true, year: true, section: true, title: true })), total: z.number().int().nonnegative() }) satisfies Schema<ExamBankList>;
export const baiduTokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().finite().positive() }) satisfies Schema<BaiduToken>;
export const baiduOcrSchema = z.object({ words_result: z.array(z.object({ words: z.string(), probability: z.object({ average: z.number().finite().min(0).max(1) }) })) }) satisfies Schema<BaiduOcrResponse>;
