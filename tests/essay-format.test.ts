import { describe, expect, it } from 'vitest';
import { repairEssayJson } from '@/lib/llm/essay-format';
import { essayPreviewFeedback } from '@/lib/utils/essay-feedback';
import { followUpContext } from '@/lib/client/follow-up';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import { essayDataSchema } from '@/lib/schemas/storage';
import { makeEssayData, makeEssayResult } from './fixtures';

describe('recoverable essay feedback', () => {
  it('repairs English quotes in generated comments without changing scores or prose', () => {
    const result = makeEssayResult();
    result.overallComment = '原文 "followed by price (24.9%) and convenience (10.7%)" 的引用可保留。';
    result.sentenceAnnotations[0]!.comment = '原文 "Learning takes practice.", 体现主题。';
    const malformed = JSON.stringify(result).replaceAll('\\"', '"');
    const repaired = repairEssayJson(malformed);
    expect(repaired).toEqual({ success: true, data: result });
    if (repaired.success) expect(createEssayResultSchema('english1', 'big').safeParse(repaired.data).success).toBe(true);
  });
  it('preserves already valid escapes, arrays and literal structural characters', () => {
    const result = makeEssayResult();
    result.suggestions = ['Use "practice", then review.', 'Keep {braces} and [brackets].'];
    expect(repairEssayJson(JSON.stringify(result))).toEqual({ success: true, data: result });
  });
  it.each(['{"overallComment":"unfinished', '{"scoreCard":function(){}}', '{"a":1}{"b":2}'])('does not invent missing fields, evaluate code or discard another root: %s', text => {
    expect(repairEssayJson(text)).toEqual({ success: false, text });
  });
  it('never turns invalid scores into valid ones', () => {
    const result = makeEssayResult(); result.scoreCard.score = 20;
    const repaired = repairEssayJson(JSON.stringify(result));
    expect(repaired.success).toBe(true);
    if (repaired.success) expect(createEssayResultSchema('english2', 'big').safeParse(repaired.data).success).toBe(false);
  });
  it('creates clearly incomplete feedback and brings the exact original into follow-up context', () => {
    const fallback = essayPreviewFeedback({ overallComment: 'Draft feedback.', sentenceAnnotations: [], improvedEssay: '', modelEssay: '' });
    expect(fallback.text).toContain('未完成有效评分'); expect(fallback.text).toContain('Draft feedback.');
    const record = { ...makeEssayData(), essay: 'He go to school.', result: fallback };
    const context = JSON.parse(followUpContext(record).summary) as Record<string, unknown>;
    expect(context).toMatchObject({ essay: 'He go to school.', assessmentStatus: 'incomplete', result: fallback });
    expect(context).not.toHaveProperty('scoreCard');
  });
  it('keeps incomplete status, original errors and multi-turn chat through a history JSON round trip', () => {
    const record = { ...makeEssayData(), essay: 'He go to school.', wordCount: 4, result: essayPreviewFeedback({ overallComment: '请检查动词。', sentenceAnnotations: [], improvedEssay: '', modelEssay: '' }) };
    const restored = essayDataSchema.parse(JSON.parse(JSON.stringify(record)));
    expect(restored.essay).toBe('He go to school.'); expect(restored.followUps).toEqual(record.followUps);
    expect(restored.result).toEqual(record.result); expect(restored.result).not.toHaveProperty('scoreCard');
    expect(JSON.parse(followUpContext(restored).summary)).toMatchObject({ essay: 'He go to school.', assessmentStatus: 'incomplete' });
  });
  it('combines quote and control-character repairs without changing generated prose', () => {
    const result = makeEssayResult(); result.overallComment = '原文 "Learning takes practice."\n建议补充例子。';
    const malformed = JSON.stringify(result).replaceAll('\\"', '"').replaceAll('\\n', '\n');
    expect(repairEssayJson(malformed)).toEqual({ success: true, data: result });
  });
});
