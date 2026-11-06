import { describe, expect, it } from 'vitest';
import { selectEssayBody, selectMarkedEssayBody } from '@/lib/utils/essay-body';
import { reviewedText, essaySubmissionInput } from '@/lib/client/essay-input';
import type { EssayDraft, EssayUploadReview } from '@/types';

const source = ['English writing practice', 'Directions: Write an essay in 160 words.', 'Student ID: 12345', 'Student essay:', 'Learning takes practice. He go to school everyday.', 'This shift highlights a consumer preference towards safety and', 'Page 1 / 2'].join('\n');
describe('select original composition instead of grading the entire paper', () => {
  it('fast-selects only a clearly marked single answer and preserves original paragraph spacing and errors', () => {
    const body = 'Learning takes practice. He go to school everyday.\n\nI write a paragraph each week and review my mistakes.';
    expect(selectMarkedEssayBody(`Directions: Write about learning.\nStudent essay:\n${body}\nPage 1 of 1`)).toEqual({ text: body, status: 'ready', excludedLines: 3 });
    expect(selectMarkedEssayBody(body)).toBeUndefined();
    expect(selectMarkedEssayBody(`Student essay:\n${body}\nStudent essay:\nAnother response.`)).toBeUndefined();
    expect(selectMarkedEssayBody(`Student essay:\n${body}\nTeacher comments: Check verbs.\nStudent continues here.`)).toBeUndefined();
    expect(selectMarkedEssayBody(`Student essay:\n${body}\n老师说需要修改。`)).toBeUndefined();
  });
  it('excludes English directions, ID and footer without fixing grammar or completing a broken sentence', () => {
    expect(selectEssayBody(source, { ranges: [{ from: 5, to: 6 }], uncertain: false })).toEqual({ text: 'Learning takes practice. He go to school everyday.\nThis shift highlights a consumer preference towards safety and', status: 'ready', excludedLines: 5 });
  });
  it('joins a composition across page headers while preserving paragraph order', () => {
    const raw = 'Writing test\nDear Tom,\nI has a question.\nPage 1\nWriting test\nCould you help me?\nYours,\nLi Ming\nPage 2';
    expect(selectEssayBody(raw, { ranges: [{ from: 2, to: 3 }, { from: 6, to: 8 }], uncertain: false }).text).toBe('Dear Tom,\nI has a question.\n\nCould you help me?\nYours,\nLi Ming');
  });
  it.each([[{ from: 5, to: 99 }], [{ from: 5, to: 4 }], [{ from: 5, to: 6 }, { from: 6, to: 7 }], [{ from: 5, to: 6 }, { from: 1, to: 2 }]].map(ranges => ({ ranges })))('rejects invented, overlapping or reordered source positions %#', ({ ranges }) => {
    expect(() => selectEssayBody(source, { ranges, uncertain: false })).toThrow('INVALID_BODY_RANGES');
  });
  it('leaves an ambiguous multi-essay document unselected, not silently using the entire paper', () => {
    const selection = selectEssayBody(source, { ranges: [{ from: 5, to: 6 }], uncertain: true });
    expect(selection).toMatchObject({ text: '', status: 'review' });
  });
  it('refuses an overbroad model selection that still contains an explicit task heading', () => {
    expect(selectEssayBody(source, { ranges: [{ from: 1, to: 7 }], uncertain: false })).toMatchObject({ text: '', status: 'review' });
  });
  it('sends only the selected text and keeps the full recognition separately', () => {
    const review: EssayUploadReview = { confirmed: false, pages: [{ number: 1, method: 'text', text: source }], body: selectEssayBody(source, { ranges: [{ from: 5, to: 6 }], uncertain: false }) };
    const draft: EssayDraft = { type: 'english1', composition: 'big', prompt: 'Write about practice.', essay: '', ocrText: '', ocrConfirmed: false, essayReview: review };
    expect(essaySubmissionInput(draft).essay).not.toMatch(/Directions|Student ID|Page 1/);
    expect(essaySubmissionInput(draft).essay).toContain('He go'); expect(review.pages[0]?.text).toBe(source);
    expect(reviewedText({ ...review, body: { text: 'not selected', status: 'review', excludedLines: 0 } }, 'manual')).toBe('');
  });
});
