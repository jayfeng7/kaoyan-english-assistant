import type { FeatureData, FollowUpContext } from '@/types';

export function followUpContext(record: FeatureData): FollowUpContext {
  const source = 'essay' in record ? { type: record.type, composition: record.composition, prompt: record.prompt, essay: record.essay }
    : 'sentence' in record ? { sentence: record.sentence }
      : { type: record.type, passage: record.passage, question: record.question, options: record.options, userAnswer: record.userAnswer };
  const incomplete = 'essay' in record && record.result && 'text' in record.result;
  return { kind: 'essay' in record ? 'essay' : 'sentence' in record ? 'sentence' : 'exam', dataRef: record.id, summary: JSON.stringify({ ...source, result: record.result, ...(incomplete ? { assessmentStatus: 'incomplete', assessmentNotice: '本次未完成有效评分，文字反馈可能不完整。请围绕原文回答，不把其中分数当作有效评分。' } : {}) }) };
}
