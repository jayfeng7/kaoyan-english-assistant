import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OcrReview } from '@/components/essay/OcrReview';
import type { OcrReviewProps } from '@/types';

const props: OcrReviewProps = {
  result: { text: 'A doubtful word.', confidence: 0.5, lowConfidenceWords: [{ word: 'doubtful', confidence: 0.4, start: 2, end: 10 }] },
  text: 'A corrected word.', onChange: () => undefined, onConfirm: () => undefined, busy: false, valid: true, confirmed: false,
};
describe('OCR proofreading view', () => {
  it('highlights exact low-confidence offsets and keeps corrected text separate', () => {
    const html = renderToStaticMarkup(createElement(OcrReview, props));
    expect(html).toMatch(/<mark[^>]*>doubtful<\/mark>/);
    expect(html).toContain('识别置信度较低，请仔细校对');
    expect(html).toContain('A corrected word.');
    expect(html).not.toContain('已确认当前校对文本');
  });
  it('prevents confirmation of invalid input and displays no low-confidence alert for confident input', () => {
    const html = renderToStaticMarkup(createElement(OcrReview, { ...props, valid: false, result: { text: 'Confident text.', confidence: 0.99, lowConfidenceWords: [] } }));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>/);
    expect(html).not.toContain('role="alert"');
  });
});
