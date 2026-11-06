import { z } from 'zod';
import type { PublicEvalMaterial, Schema } from '@/types';

export const publicEvalMaterialSchema = z.object({
  id: z.string().regex(/^[HP]\d{2}$/), file: z.string().regex(/^[a-z0-9-]+\.(png|jpg|pdf)$/), url: z.string().url(), source: z.string().url(), author: z.string().min(1), license: z.string().min(1), sha256: z.string().regex(/^[a-f0-9]{64}$/), mime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']), referenceStatus: z.enum(['ai_visual_checked', 'pending']), reference: z.string().min(1).optional(), expectedPages: z.number().int().min(1).max(5).optional(),
}).strict().superRefine((item, context) => {
  if (item.referenceStatus === 'ai_visual_checked' && !item.reference) context.addIssue({ code: 'custom', message: 'Missing provisional transcript' });
  if (!['upload.wikimedia.org', 'constitutioncenter.org'].includes(new URL(item.url).hostname)) context.addIssue({ code: 'custom', message: 'Source host not allowlisted' });
}) satisfies Schema<PublicEvalMaterial>;
