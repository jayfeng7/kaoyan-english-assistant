import { z } from 'zod';
import { errorCodeSchema, historyTypeSchema, providerIdSchema, timestampSchema, uuidSchema } from './common';
import type { ChatMessage, ChatRequest, ChatStreamEvent, FollowUpContext, Schema } from '@/types';

export const followUpContextSchema = z.object({ kind: historyTypeSchema, summary: z.string().min(1).refine((value) => Boolean(value.trim()), '缺少追问上下文'), dataRef: z.string().optional() }) satisfies Schema<FollowUpContext>;
export const chatRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).refine((value) => Boolean(value.trim()), '请输入消息') })).min(1),
  historyId: z.string().optional(), followUp: followUpContextSchema.optional(),
}) satisfies Schema<ChatRequest>;
const citationsSchema = z.array(z.object({
  label: z.number().int().min(1).max(2),
  id: z.string().min(1).max(100),
  title: z.string().min(1).max(150),
  excerpt: z.string().min(1).max(1000),
  example: z.string().min(1).max(500),
})).max(2).optional();
export const chatMessageSchema = z.object({ id: uuidSchema, role: z.enum(['user', 'assistant']), content: z.string(), createdAt: timestampSchema, status: z.enum(['streaming', 'done', 'error']), provider: z.string().optional(), citations: citationsSchema }) satisfies Schema<ChatMessage>;
export const chatStreamEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('delta'), content: z.string() }),
  z.object({ type: z.literal('done'), provider: providerIdSchema, citations: citationsSchema }),
  z.object({ type: z.literal('error'), message: z.string().min(1), code: errorCodeSchema }),
]) satisfies Schema<ChatStreamEvent>;
