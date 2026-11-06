import { annotationHasEssayEvidence, scoreHasEssayEvidence } from '@/lib/utils/essay-evidence';
import type { EssayReport, Schema, ScoreCard } from '@/types';

export function groundedEssaySchema<T extends EssayReport>(schema: Schema<T>, essay: string): Schema<T> {
  return schema.superRefine((report, context) => {
    if (!scoreHasEssayEvidence(report.scoreCard, essay)) context.addIssue({ code: 'custom', path: ['scoreCard', 'bandReason'], message: '评分依据必须引用学生原文中的实际片段' });
    report.sentenceAnnotations.forEach((annotation, index) => {
      if (!annotationHasEssayEvidence(annotation, essay)) context.addIssue({ code: 'custom', path: ['sentenceAnnotations', index], message: '批注必须引用学生原句，不得将改写、题面或不存在的文字当作原文' });
    });
  });
}
export function groundedScoreSchema(schema: Schema<ScoreCard>, essay: string): Schema<ScoreCard> {
  return schema.superRefine((card, context) => {
    if (!scoreHasEssayEvidence(card, essay)) context.addIssue({ code: 'custom', path: ['bandReason'], message: '评分依据未引用学生原文' });
  });
}
