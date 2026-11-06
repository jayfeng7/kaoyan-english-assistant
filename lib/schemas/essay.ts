import { z } from 'zod';
import { boundedText, compositionTypeSchema, examTypeSchema, errorCodeSchema, providerIdSchema, textFallbackSchema } from './common';
import { essaySourceSchema } from './essay-bank';
import type { CompositionType, EssayCorrectRequest, EssayResult, EssayCoreResult, EssayReport, EssayReferenceResult, EssayStreamEvent, ExamType, Schema, ScoreCard } from '@/types';

export const essayCorrectRequestSchema = z.object({
  type: examTypeSchema, composition: compositionTypeSchema,
  prompt: z.string().max(500).default(''), essay: boundedText(8000), wordCount: z.number().int().positive().optional(), source: essaySourceSchema.optional(), bankId: z.string().min(1).optional(),
  report: z.enum(['core', 'full']).optional(),
  inputEvidence: z.object({ origin: z.literal('ocr'), reviewed: z.boolean(), pageCompleteness: z.enum(['unknown', 'full', 'partial']), bodyStatus: z.enum(['ready', 'review']), confidence: z.number().finite().min(0).max(1), uncertainSegments: z.number().int().nonnegative() }).strict().optional(),
}).superRefine((input, ctx) => {
  if (input.source === 'bank' ? !input.bankId : !input.prompt.trim()) ctx.addIssue({ code: 'custom', message: '请选择真题或填写题目' });
}) satisfies Schema<EssayCorrectRequest>;

export const sentenceAnnotationSchema = z.object({
  index: z.number().int().positive(), original: z.string().min(1),
  type: z.enum(['problem', 'highlight', 'neutral']), comment: z.string().min(1),
  correction: z.string().optional(), grammarPoint: z.string().optional(),
});

const scoreCardObjectSchema = z.object({
    band: z.object({ level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), name: z.string().min(1), range: z.string().min(1) }),
    score: z.number().finite().min(0).max(20), bandReason: z.string().min(1),
    breakdown: z.object({ content: z.number().finite().nonnegative(), language: z.number().finite().nonnegative(), structure: z.number().finite().nonnegative() }),
  });
export const essayReferenceSchema = z.object({
  improvedEssay: boundedText(12000), modelEssay: boundedText(12000),
  expressions: z.array(z.object({ expression: z.string().min(1), meaning: z.string().min(1), example: z.string().min(1) }).strict()).max(2),
}).strict() satisfies Schema<EssayReferenceResult>;
const coreObjectSchema = z.object({ kind: z.literal('core'), scoreCard: scoreCardObjectSchema, overallComment: boundedText(2000), sentenceAnnotations: z.array(sentenceAnnotationSchema).max(3), suggestions: z.array(boundedText(500)).min(1).max(2) }).strict();
export function createEssayCoreResultSchema(type: ExamType, composition: CompositionType) {
  return coreObjectSchema.superRefine((value, ctx) => {
    if (!createEssayScoreCardSchema(type, composition).safeParse(value.scoreCard).success) ctx.addIssue({ code: 'custom', path: ['scoreCard'], message: '评分与分制或合计不一致' });
  }) satisfies Schema<EssayCoreResult>;
}
export const scoreCardSchema = scoreCardObjectSchema.superRefine((value, ctx) => {
  if (Math.abs(value.breakdown.content + value.breakdown.language + value.breakdown.structure - value.score) > 0.000001) ctx.addIssue({ code: 'custom', path: ['breakdown'], message: '分项得分之和应等于总分' });
}) satisfies Schema<ScoreCard>;

const essayResultObjectSchema = z.object({
  kind: z.undefined().optional(),
  scoreCard: scoreCardObjectSchema,
  overallComment: z.string().min(1), sentenceAnnotations: z.array(sentenceAnnotationSchema),
  improvedEssay: z.string().min(1), modelEssay: z.string().min(1),
  expressions: z.array(z.object({ expression: z.string().min(1), meaning: z.string().min(1), example: z.string().min(1) })),
  suggestions: z.array(z.string().min(1)),
});

export const essayResultSchema = essayResultObjectSchema.superRefine((value, ctx) => {
  const { score, breakdown } = value.scoreCard;
  if (Math.abs(breakdown.content + breakdown.language + breakdown.structure - score) > 0.000001) {
    ctx.addIssue({ code: 'custom', path: ['scoreCard', 'breakdown'], message: '分项得分之和应等于总分' });
  }
}) satisfies Schema<EssayResult>;

export const essayReportSchema = z.union([essayResultSchema, coreObjectSchema.extend({ reference: essayReferenceSchema.optional() }).superRefine((value, ctx) => {
  if (!scoreCardSchema.safeParse(value.scoreCard).success) ctx.addIssue({ code: 'custom', path: ['scoreCard'], message: '评分合计不一致' });
})]) satisfies Schema<EssayReport>;
export function createEssayReportSchema(type: ExamType, composition: CompositionType) {
  return essayReportSchema.superRefine((value, ctx) => {
    if (!createEssayScoreCardSchema(type, composition).safeParse(value.scoreCard).success) ctx.addIssue({ code: 'custom', path: ['scoreCard'], message: '评分与题型不一致' });
  });
}

export function createEssayResultSchema(type: ExamType, composition: CompositionType) {
  const bands = composition === 'small'
    ? [[0, 0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10]]
    : type === 'english2' ? [[0, 0], [1, 3], [4, 6], [7, 9], [10, 12], [13, 15]]
      : [[0, 0], [1, 4], [5, 8], [9, 12], [13, 16], [17, 20]];
  return essayResultSchema.superRefine((value, ctx) => {
    const interval = bands[value.scoreCard.band.level];
    const min = interval?.[0]; const max = interval?.[1];
    if (min === undefined || max === undefined || value.scoreCard.score < min || value.scoreCard.score > max) {
      ctx.addIssue({ code: 'custom', path: ['scoreCard', 'score'], message: '得分超出当前题型和档次的区间' });
    }
  });
}

export function createEssayScoreCardSchema(type: ExamType, composition: CompositionType) {
  const bands = composition === 'small' ? [[0, 0], [1, 2], [3, 4], [5, 6], [7, 8], [9, 10]] : type === 'english2' ? [[0, 0], [1, 3], [4, 6], [7, 9], [10, 12], [13, 15]] : [[0, 0], [1, 4], [5, 8], [9, 12], [13, 16], [17, 20]];
  return scoreCardSchema.superRefine((value, ctx) => {
    const interval = bands[value.band.level];
    if (!interval || value.score < interval[0]! || value.score > interval[1]!) ctx.addIssue({ code: 'custom', path: ['score'], message: '得分超出题型档次区间' });
  });
}

export function createEssayStreamEventSchema(type: ExamType, composition: CompositionType) {
  return z.discriminatedUnion('type', [
    z.object({ type: z.literal('status'), stage: z.literal('generating') }),
    z.object({ type: z.literal('score'), scoreCard: createEssayScoreCardSchema(type, composition) }),
    z.object({ type: z.literal('preview'), field: z.enum(['overallComment', 'improvedEssay', 'modelEssay']), text: z.string() }),
    z.object({ type: z.literal('annotation'), annotation: sentenceAnnotationSchema }),
    z.object({ type: z.literal('done'), data: z.union([createEssayReportSchema(type, composition), textFallbackSchema]), provider: providerIdSchema }),
    z.object({ type: z.literal('error'), message: z.string(), code: errorCodeSchema }),
  ]) satisfies Schema<EssayStreamEvent>;
}
