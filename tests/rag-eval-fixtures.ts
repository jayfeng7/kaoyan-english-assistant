import { z } from 'zod';
import data from '../learning/rag/data/retrieval-v2.json';
import type { ChatRequest } from '@/types';

export const evalCaseSchema = z.object({
  id: z.string(),
  split: z.enum(['dev', 'holdout']),
  group: z.enum(['paraphrase', 'direct', 'followup', 'negative']),
  composition: z.enum(['small', 'big']),
  prompt: z.string(),
  previous: z.string().optional(),
  question: z.string(),
  relevance: z.record(z.number().int().min(1).max(2)),
});

export const cases = z.array(evalCaseSchema).parse(data.cases);
export type EvalCase = typeof cases[number];

export function toChatRequest(row: EvalCase): ChatRequest {
  return {
    messages: [
      ...(row.previous ? [
        { role: 'user' as const, content: row.previous },
        { role: 'assistant' as const, content: '可以先确定这条问题涉及的写作规则。' },
      ] : []),
      { role: 'user', content: row.question },
    ],
    followUp: { kind: 'essay', summary: JSON.stringify({ composition: row.composition, prompt: row.prompt }) },
  };
}

export function mean(values: (number | null)[]) {
  const numeric = values.filter((value): value is number => value !== null);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
}

export function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1] ?? 0;
}
