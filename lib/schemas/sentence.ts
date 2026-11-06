import { z } from 'zod';
import { boundedText } from './common';
import type { Schema, SentenceAnalyzeRequest, SentenceResult } from '@/types';

export const sentenceAnalyzeRequestSchema = z.object({ sentence: boundedText(2000) }) satisfies Schema<SentenceAnalyzeRequest>;
export const sentenceResultSchema = z.object({
  segments: z.array(z.string().min(1)).min(1), trunk: z.string().min(1),
  clauses: z.array(z.object({ type: z.string().min(1), text: z.string().min(1), function: z.string().min(1) })),
  modifiers: z.array(z.string()), translation: z.string().min(1), grammarPoints: z.array(z.string()), imitation: z.string().min(1),
}) satisfies Schema<SentenceResult>;
