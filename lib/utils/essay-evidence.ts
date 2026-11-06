import type { EssayReport, SentenceAnnotation, ScoreCard } from '@/types';

// Preserve spelling, case and punctuation. Only line wrapping/spacing is ignored.
const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
export function containsEssayEvidence(essay: string, quote: string): boolean {
  const normalized = normalize(quote);
  return /[A-Za-z]/u.test(normalized) && normalize(essay).includes(normalized);
}
export function hasLiteralEssayQuote(comment: string, essay: string): boolean {
  return [...comment.matchAll(/「([^「」]+)」|“([^“”]+)”|"([^"]+)"/gu)].some(match => containsEssayEvidence(essay, (match[1] ?? match[2] ?? match[3])!));
}
export function scoreHasEssayEvidence(card: ScoreCard, essay: string): boolean {
  return hasLiteralEssayQuote(card.bandReason, essay);
}
export function annotationHasEssayEvidence(annotation: SentenceAnnotation, essay: string): boolean {
  return containsEssayEvidence(essay, annotation.original) && hasLiteralEssayQuote(annotation.comment, annotation.original);
}
export function reportHasEssayEvidence(report: EssayReport, essay: string): boolean {
  return scoreHasEssayEvidence(report.scoreCard, essay) && report.sentenceAnnotations.every(annotation => annotationHasEssayEvidence(annotation, essay));
}
