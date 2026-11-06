import { describe, expect, it } from 'vitest';
import { repairJson } from '@/lib/utils/json-repair';

describe('JSON repair without executing generated content', () => {
  it.each(['{"score":14}', '```json\n{"score":14}\n```', 'result follows: {"score":14} end', '{score:14,}', '{"score":14,"items":[1,2,],}'])('repairs supported formatting %s', (input) => {
    const result = repairJson(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ score: 14 });
  });
  it('escapes raw newlines and tabs inside string values', () => {
    const input = '{"improvedEssay":"Dear Mr. Smith,\nI am Li Ming.\n\tYours sincerely,","score":9}';
    expect(input.includes('\\n')).toBe(false);
    const result = repairJson(input);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ score: 9, improvedEssay: 'Dear Mr. Smith,\nI am Li Ming.\n\tYours sincerely,' });
  });
  it('does not change commas/braces/key-like text inside quoted strings', () => {
    const text = 'contains, } {unquoted: and \\"quoted\\" text';
    const input = `{text:${JSON.stringify(text)},}`;
    expect(repairJson(input)).toEqual({ success: true, data: { text } });
  });
  it.each(['{"score":14}}', '{"score":14} } }', '{"score":14,"items":[{"text":"literal } ] and \\\"quote\\\""}]}}'])('removes delimiter-only suffixes after a complete root: %s', (input) => {
    const result = repairJson(input); expect(result.success).toBe(true);
    if (result.success) expect(result.data).toMatchObject({ score: 14 });
  });
  it('can combine trailing-delimiter and control-character repairs without changing the text', () => {
    expect(repairJson('{"text":"line one\nline two","score":14}}')).toEqual({ success: true, data: { text: 'line one\nline two', score: 14 } });
  });
  it.each(['{"score":14},{"score":99}', '{"score":14},"extra":99}', '{"score":14,"items":[1}}', '{"score":14}{"other":1}'])('does not discard additional values or incomplete nested content: %s', (text) => {
    expect(repairJson(text)).toEqual({ success: false, text });
  });
  it.each(['plain recoverable explanation', '{unfinished:', '{"a": function(){}}', '{"a": NaN}', ''])('returns the original text when safe repair is impossible %j', (text) => {
    expect(repairJson(text)).toEqual({ success: false, text });
  });
});
