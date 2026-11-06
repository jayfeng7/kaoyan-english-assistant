import type { ChatData, EssayData, EssayResult, EssayBankItem, ExamBankItem, ExamData, HistoryRecord, ProviderConfig, SentenceData, SentenceResult } from '@/types';

export function makeEssayBankItem(): EssayBankItem { return { id: 'english1-2019-big', type: 'english1', composition: 'big', year: 2019, title: 'Synthetic writing task', directions: 'Write about practice.', materialDescription: 'A synthetic practice picture.', source: 'Synthetic fixture, not an exam.', reviewed: true }; }

export const TEST_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_ID_2 = '00000000-0000-4000-8000-000000000002';
export const TEST_ID_3 = '00000000-0000-4000-8000-000000000003';
export const TEST_ID_4 = '00000000-0000-4000-8000-000000000004';

export function makeEssayResult(): EssayResult {
  return {
    scoreCard: { band: { level: 4, name: '第四档', range: '13-16分' }, score: 14, bandReason: '原文“Learning”切题。', breakdown: { content: 5, language: 5, structure: 4 } },
    overallComment: '原文“Learning takes practice.”表达清晰。',
    sentenceAnnotations: [{ index: 1, original: 'Learning takes practice.', type: 'highlight', comment: '“takes practice”自然。' }],
    improvedEssay: 'Learning requires regular practice.', modelEssay: 'Regular practice helps us learn.',
    expressions: [{ expression: 'regular practice', meaning: '规律练习', example: 'Regular practice helps.' }], suggestions: ['补充具体例子。'],
  };
}
export function makeSentenceResult(): SentenceResult {
  return { segments: ['Although learning takes time,', 'practice helps.'], trunk: 'practice helps 主谓结构', clauses: [{ type: '让步状语从句', text: 'Although learning takes time', function: '表达让步' }], modifiers: [], translation: '尽管学习需要时间，练习仍有帮助。', grammarPoints: ['让步从句'], imitation: 'Although progress is slow, practice matters.' };
}
export function makeEssayData(): EssayData {
  return { id: TEST_ID, type: 'english1', composition: 'big', title: 'Practice', prompt: 'Write about practice.', essay: 'Learning takes practice.', wordCount: 3, createdAt: 100, result: makeEssayResult(), provider: 'deepseek', followUps: [{ id: TEST_ID_4, role: 'assistant', content: '可补充例子。', createdAt: 101, status: 'done', provider: 'deepseek' }] };
}
export function makeSentenceData(): SentenceData {
  return { id: TEST_ID_2, sentence: 'Although learning takes time, practice helps.', createdAt: 100, result: makeSentenceResult(), provider: 'deepseek' };
}
export function makeExamData(): ExamData {
  return { id: TEST_ID_3, type: 'english2', source: 'paste', passage: 'This is a synthetic test passage.', createdAt: 100, result: { passageAnalysis: { paragraphs: [{ index: 1, summary: '练习', keySentences: ['This is a synthetic test passage.'] }], vocabulary: [] }, questionAnalysis: { questionType: '主旨', answer: 'A', locating: 'synthetic test', reasoning: '测试定位。' }, distractorAnalysis: [], fullTranslation: null }, provider: 'deepseek' };
}
export function makeChatData(): ChatData {
  return { id: TEST_ID_4, title: '如何练习', createdAt: 100, updatedAt: 101, messages: [{ id: TEST_ID, role: 'user', content: '如何练习', createdAt: 100, status: 'done' }, { id: TEST_ID_2, role: 'assistant', content: '坚持规律练习。', createdAt: 101, status: 'done', provider: 'deepseek' }] };
}
export function makeHistory(): HistoryRecord {
  return { id: TEST_ID, type: 'essay', title: 'Practice', preview: 'Learning takes practice.', createdAt: 100, updatedAt: 101, data: makeEssayData() };
}
export function makeProviders(): ProviderConfig[] {
  return [
    { id: 'deepseek', apiKey: 'test-only', baseURL: 'https://example.invalid/v1', model: 'test-model' },
    { id: 'siliconflow', apiKey: 'test-only', baseURL: 'https://example.invalid/v1', model: 'test-model' },
    { id: 'openrouter', apiKey: 'test-only', baseURL: 'https://example.invalid/v1', model: 'test-model' },
  ];
}
export function makeBankItem(): ExamBankItem {
  return { id: 'english1-2025-text1', type: 'english1', year: 2025, section: 'Text 1', title: 'Synthetic practice', passage: 'Synthetic passage only; never real exam data.', questions: [{ id: 'q1', question: 'What is the topic?', options: ['A. Practice', 'B. Weather', 'C. Travel', 'D. Food'], answer: 'A' }] };
}
