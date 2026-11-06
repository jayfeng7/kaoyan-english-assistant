import { z } from 'zod';
import { boundedText } from './common';
import { essayBankListSchema } from './essay-bank';

export const essayIdentifyRequestSchema = z.object({
  essay: boundedText(8000), prompt: z.string().max(500).default(''),
  inputEvidence: z.object({ origin: z.literal('ocr'), reviewed: z.boolean(), pageCompleteness: z.enum(['unknown', 'full', 'partial']), bodyStatus: z.enum(['ready', 'review']), confidence: z.number().finite().min(0).max(1), uncertainSegments: z.number().int().nonnegative() }).strict().optional(),
});
export const essayMatchOutputSchema = z.object({ candidates: z.array(z.object({
  id: z.string().regex(/^english[12]-20\d{2}-(big|small)$/), confidence: z.number().finite().min(0).max(1),
  evidence: z.array(z.string().max(2000)).max(12), reason: z.string().min(1).max(240),
}).strict()).max(3), limitations: z.array(z.string().min(1).max(240)).max(4) }).strict();
const bankMeta = essayBankListSchema.shape.items.element;
export const essayIdentificationSchema = z.object({
  status: z.enum(['suggested', 'ambiguous', 'unknown']), needsConfirmation: z.literal(true),
  confidence: z.number().finite().min(0).max(1),
  candidates: z.array(bankMeta.extend({ confidence: z.number().finite().min(0).max(1), evidence: z.array(z.string().min(8).max(180)).min(1).max(3), reason: z.string().min(1).max(240) })).max(3),
  limitations: z.array(z.string().min(1)).min(1),
});
export type EssayIdentifyRequest = z.infer<typeof essayIdentifyRequestSchema>;
export type EssayIdentification = z.infer<typeof essayIdentificationSchema>;
