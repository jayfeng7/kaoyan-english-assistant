import 'server-only';
import type { CharacterErrorMetric } from '@/types';

export function characterErrorRate(reference: string, hypothesis: string): CharacterErrorMetric {
  const expected = Array.from(reference); const actual = Array.from(hypothesis);
  if (!expected.length) throw new Error('EVAL_REFERENCE_EMPTY');
  let previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row++) {
    const current = [row];
    for (let column = 1; column <= actual.length; column++) current[column] = Math.min((current[column - 1] ?? 0) + 1, (previous[column] ?? 0) + 1, (previous[column - 1] ?? 0) + (expected[row - 1] === actual[column - 1] ? 0 : 1));
    previous = current;
  }
  const edits = previous[actual.length] ?? 0;
  return { referenceCharacters: expected.length, hypothesisCharacters: actual.length, edits, cer: edits / expected.length };
}
export function normalizeOcrText(text: string): string { return text.normalize('NFC').replace(/\s+/gu, ' ').trim(); }
