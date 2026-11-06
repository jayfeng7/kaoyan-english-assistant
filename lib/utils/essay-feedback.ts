import type { EssayStreamPreview, TextFallback } from '@/types';

export function essayPreviewFeedback(preview: EssayStreamPreview): TextFallback {
  const sections = ['本次未完成有效评分。以下仅为已生成的文字反馈，可能不完整或存在错误；不代表完整批改报告或有效分数。可以围绕原文继续讨论，也可以重新批改。'];
  if (preview.overallComment.trim()) sections.push(`## 已有总评\n\n${preview.overallComment}`);
  if (preview.sentenceAnnotations.length) sections.push(`## 已有逐句反馈\n\n${preview.sentenceAnnotations.map(item => `原句：${item.original}\n\n${item.comment}${item.correction ? `\n\n修改参考：${item.correction}` : ''}`).join('\n\n')}`);
  if (preview.improvedEssay.trim()) sections.push(`## 已有改写参考\n\n${preview.improvedEssay}`);
  if (preview.modelEssay.trim()) sections.push(`## 已有范文参考\n\n${preview.modelEssay}`);
  return { text: sections.join('\n\n') };
}
