import { essayReviewReason, uploadEvidence } from '@/lib/utils/essay-safety';
import { essayCorrectRequestSchema } from '@/lib/schemas/essay';
import type { EssayBankItem, EssayCorrectRequest, EssayDraft, EssayUploadReview } from '@/types';

export function essayBankPrompt(item: EssayBankItem): string { return [item.directions, item.materialDescription].filter(Boolean).join('\n\n'); }
export function essayBankSelectionPatch(draft: EssayDraft, item: EssayBankItem): Partial<EssayDraft> {
  return { type: item.type, composition: item.composition, source: 'bank', bankId: item.id, bankItem: item, year: item.year, prompt: essayBankPrompt(item), ...((draft.source ?? 'custom') === 'custom' ? { customPrompt: draft.prompt } : {}) };
}
export function reviewedText(review: EssayUploadReview | undefined, fallback: string): string { return review?.body ? review.body.status === 'ready' ? review.body.text : '' : review ? review.pages.map((page) => page.text).join('\n\n') : fallback; }

// Carry OCR provenance through the scoring boundary; confirmation is invalidated on edits.
export function essaySubmissionInput(draft: EssayDraft): EssayCorrectRequest {
  const source = draft.source ?? 'custom';
  return { type: draft.type, composition: draft.composition, source, bankId: source === 'bank' ? draft.bankId : undefined,
    prompt: reviewedText(source === 'custom' ? draft.promptReview : undefined, draft.prompt),
    essay: reviewedText(draft.essayReview, draft.ocrResult ? draft.ocrText : draft.essay),
    inputEvidence: draft.essayReview ? uploadEvidence(draft.essayReview.pages, draft.essayReview.confirmed, draft.essayReview.pageCompleteness ?? 'unknown', draft.essayReview.body?.status ?? 'ready')
      : draft.ocrResult ? uploadEvidence([{ ocr: draft.ocrResult }], draft.ocrConfirmed, draft.ocrPageCompleteness ?? 'unknown', 'ready') : undefined };
}

export function checkEssaySubmission(draft: EssayDraft) {
  const input = essaySubmissionInput(draft);
  if (input.source === 'bank' && (!draft.bankItem || draft.bankItem.id !== input.bankId || draft.bankItem.type !== input.type || draft.bankItem.composition !== input.composition)) return essayCorrectRequestSchema.safeParse({ ...input, bankId: undefined });
  return essayCorrectRequestSchema.superRefine((value, ctx) => { const reason = essayReviewReason(value); if (reason) ctx.addIssue({ code: 'custom', path: ['essay'], message: reason }); }).safeParse(input);
}
