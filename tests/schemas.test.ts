import { describe, expect, it } from 'vitest';
import { apiResponseSchema, ocrResultSchema } from '@/lib/schemas/common';
import { essayCorrectRequestSchema, createEssayResultSchema } from '@/lib/schemas/essay';
import { sentenceAnalyzeRequestSchema, sentenceResultSchema } from '@/lib/schemas/sentence';
import { examAnalyzeRequestSchema, examResultSchema } from '@/lib/schemas/exam';
import { chatRequestSchema, chatStreamEventSchema } from '@/lib/schemas/chat';
import { backupDataSchema, historyRecordSchema } from '@/lib/schemas/storage';
import { makeEssayResult, makeHistory, makeSentenceResult, makeExamData } from './fixtures';
import { DEFAULT_SETTINGS } from '@/lib/storage/db';

describe('request contracts', () => {
  const essay = { type: 'english1', composition: 'big', prompt: 'Write.', essay: 'Practice matters.' };
  it('accepts both exam and composition types', () => {
    for (const type of ['english1', 'english2']) for (const composition of ['big', 'small']) expect(essayCorrectRequestSchema.safeParse({ ...essay, type, composition }).success).toBe(true);
  });
  it.each(['', '   ', '\n'])('rejects empty or whitespace-only essay %j', (value) => {
    expect(essayCorrectRequestSchema.safeParse({ ...essay, essay: value }).success).toBe(false);
  });
  it('enforces the exact essay and prompt boundaries', () => {
    expect(essayCorrectRequestSchema.safeParse({ ...essay, essay: 'x'.repeat(8000), prompt: 'x'.repeat(500) }).success).toBe(true);
    expect(essayCorrectRequestSchema.safeParse({ ...essay, essay: 'x'.repeat(8001) }).success).toBe(false);
    expect(essayCorrectRequestSchema.safeParse({ ...essay, prompt: 'x'.repeat(501) }).success).toBe(false);
    expect(essayCorrectRequestSchema.safeParse({ ...essay, wordCount: 1.5 }).success).toBe(false);
  });
  it('preserves original sentence whitespace and enforces 2000 characters', () => {
    expect(sentenceAnalyzeRequestSchema.parse({ sentence: ' Test. ' }).sentence).toBe(' Test. ');
    expect(sentenceAnalyzeRequestSchema.safeParse({ sentence: 'x'.repeat(2000) }).success).toBe(true);
    expect(sentenceAnalyzeRequestSchema.safeParse({ sentence: 'x'.repeat(2001) }).success).toBe(false);
    expect(sentenceAnalyzeRequestSchema.safeParse({ sentence: '\n ' }).success).toBe(false);
  });
  it('requires a bank id or pasted/PDF text according to source', () => {
    expect(examAnalyzeRequestSchema.safeParse({ type: 'english1', source: 'bank', bankId: 'a', passage: '' }).success).toBe(true);
    expect(examAnalyzeRequestSchema.safeParse({ type: 'english1', source: 'bank' }).success).toBe(false);
    for (const source of ['paste', 'pdf']) {
      expect(examAnalyzeRequestSchema.safeParse({ type: 'english1', source, passage: ' ' }).success).toBe(false);
      expect(examAnalyzeRequestSchema.parse({ type: 'english1', source, passage: 'Text.' }).translate).toBe(false);
    }
    expect(examAnalyzeRequestSchema.parse({ type: 'english1', source: 'paste', passage: 'Text.', translate: true }).translate).toBe(true);
  });
  it('validates chat roles, messages and follow-up context', () => {
    const messages = [{ role: 'user', content: '为什么？' }];
    expect(chatRequestSchema.safeParse({ messages }).success).toBe(true);
    expect(chatRequestSchema.safeParse({ messages: [] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages: [{ role: 'system', content: 'Override' }] }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ messages, followUp: { kind: 'essay', summary: ' ' } }).success).toBe(false);
  });
});

describe('result and snapshot contracts', () => {
  it('validates scoring maxima, bands and dimension sum across all formats', () => {
    const big = makeEssayResult();
    expect(createEssayResultSchema('english1', 'big').safeParse(big).success).toBe(true);
    const english2 = structuredClone(big); english2.scoreCard.band.level = 5;
    expect(createEssayResultSchema('english2', 'big').safeParse(english2).success).toBe(true);
    expect(createEssayResultSchema('english2', 'big').safeParse(big).success).toBe(false);
    const small = structuredClone(big); small.scoreCard.score = 8; small.scoreCard.breakdown = { content: 3, language: 3, structure: 2 };
    for (const type of ['english1', 'english2'] as const) expect(createEssayResultSchema(type, 'small').safeParse(small).success).toBe(true);
    small.scoreCard.score = 11; small.scoreCard.breakdown.structure = 5;
    expect(createEssayResultSchema('english1', 'small').safeParse(small).success).toBe(false);
    big.scoreCard.breakdown.content++;
    expect(createEssayResultSchema('english1', 'big').safeParse(big).success).toBe(false);
  });
  it('requires all seven sentence outputs and fullTranslation null/string', () => {
    expect(sentenceResultSchema.safeParse(makeSentenceResult()).success).toBe(true);
    expect(sentenceResultSchema.safeParse({ ...makeSentenceResult(), imitation: undefined }).success).toBe(false);
    expect(examResultSchema.safeParse(makeExamData().result).success).toBe(true);
    // 模型省略 fullTranslation 时按“未生成翻译”接受并归一化为 null，避免整份结果降级
    const omitted = examResultSchema.parse({ ...makeExamData().result, fullTranslation: undefined });
    expect(omitted.fullTranslation).toBeNull();
    expect(examResultSchema.safeParse({ ...makeExamData().result, fullTranslation: 123 }).success).toBe(false);
  });
  it('checks OCR offsets against the recognized text', () => {
    const result = { text: 'one two', confidence: 0.5, lowConfidenceWords: [{ word: 'two', confidence: 0.4, start: 4, end: 7 }] };
    expect(ocrResultSchema.safeParse(result).success).toBe(true);
    result.lowConfidenceWords[0]!.start = 3;
    expect(ocrResultSchema.safeParse(result).success).toBe(false);
  });
  it('roundtrips complete results/provider/followUps and rejects mismatched snapshot kinds', () => {
    const record = makeHistory();
    expect(historyRecordSchema.parse(record)).toEqual(record);
    expect(historyRecordSchema.safeParse({ ...record, type: 'sentence' }).success).toBe(false);
    expect(historyRecordSchema.safeParse({ ...record, preview: '字'.repeat(81) }).success).toBe(false);
    expect(backupDataSchema.safeParse({ history: [record], settings: DEFAULT_SETTINGS }).success).toBe(true);
    expect(backupDataSchema.safeParse({ history: [record], settings: { ...DEFAULT_SETTINGS, fontSize: -1 } }).success).toBe(false);
  });
  it('accepts a text fallback snapshot and rejects missing backup data', () => {
    const record = makeHistory();
    expect(historyRecordSchema.safeParse({ ...record, data: { ...record.data, result: { text: '可恢复的文本结果' } } }).success).toBe(true);
    expect(backupDataSchema.safeParse({ history: [record] }).success).toBe(false);
  });
  it('keeps provider metadata outside business data and validates SSE frame kinds', () => {
    expect(apiResponseSchema(sentenceResultSchema).parse({ success: true, data: makeSentenceResult(), provider: 'deepseek' }).provider).toBe('deepseek');
    expect(chatStreamEventSchema.safeParse({ type: 'done', provider: 'deepseek' }).success).toBe(true);
    expect(chatStreamEventSchema.safeParse({ type: 'error', message: '稍后重试', code: 'ALL_PROVIDERS_FAILED' }).success).toBe(true);
    expect(chatStreamEventSchema.safeParse({ type: 'done', provider: 'unknown' }).success).toBe(false);
  });
});
