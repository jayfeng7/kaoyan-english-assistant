import type { EssayBodyRanges, EssayBodySelection } from '@/types';

export function essaySourceLines(text: string): string[] { return text.replace(/\r\n?/gu, '\n').split('\n'); }

// Only an explicit, single answer block gets a deterministic fast path. Unknown
// layouts, interleaved comments and multiple answers still use the selector.
export function selectMarkedEssayBody(source: string): EssayBodySelection | undefined {
  const lines = essaySourceLines(source);
  const marker = /^\s*(?:Student(?:'s)?\s+(?:essay|answer)|学生(?:作文|答案)|作文正文)\s*[:：]\s*$/iu;
  const starts = lines.flatMap((line, index) => marker.test(line) ? [index] : []);
  if (starts.length !== 1) return;
  const start = starts[0]! + 1;
  const endLabel = /^\s*(?:Teacher\s+comments?|Reference\s+answer|Model\s+(?:essay|answer)|Score|教师批注|参考范文|评分标准)\s*[:：]/iu;
  const footer = /^\s*(?:Page\s+\d+(?:\s*(?:\/|of)\s*\d+)?|第\s*\d+\s*页)\s*$/iu;
  let end = lines.findIndex((line, index) => index >= start && endLabel.test(line));
  if (end < 0) end = lines.length;
  if (lines.slice(end).some(line => line.trim() && !endLabel.test(line) && !footer.test(line))) return;
  const indexes = lines.flatMap((line, index) => index >= start && index < end && !footer.test(line) ? [index] : []);
  const text = indexes.map(index => lines[index]).join('\n');
  if (text.trim().split(/\s+/u).length < 15 || /\p{Script=Han}|(?:Directions|Instructions|Reference answer|Model essay|Teacher comments|Student ID|writing practice)\s*[:：]?/iu.test(text)) return;
  const ranges: EssayBodyRanges['ranges'] = [];
  for (const index of indexes) {
    const last = ranges.at(-1);
    if (last?.to === index) last.to = index + 1;
    else ranges.push({ from: index + 1, to: index + 1 });
  }
  const selected = selectEssayBody(source, { ranges, uncertain: false });
  return selected.status === 'ready' ? selected : undefined;
}

// The model selects positions only. Every selected character comes from the OCR
// source; grammar, spelling, punctuation and paragraph order are never corrected.
export function selectEssayBody(source: string, selection: EssayBodyRanges): EssayBodySelection {
  const lines = essaySourceLines(source); let previousEnd = 0;
  for (const range of selection.ranges) {
    if (range.from <= previousEnd || range.to < range.from || range.to > lines.length) throw new Error('INVALID_BODY_RANGES');
    previousEnd = range.to;
  }
  const text = selection.ranges.map(range => lines.slice(range.from - 1, range.to).join('\n')).join('\n\n');
  const containsPaperMetadata = text.split('\n').some(line => /^\s*(?:Directions\s*[:：]|(?:Name|Student\s*ID|Candidate\s*(?:No\.?|Number)|Score)\s*[:：]|Page\s+\d+(?:\s*(?:\/|of)\s*\d+)?\s*$|(?:姓名|考号|准考证号|参考范文|评分标准)\s*[:：])/iu.test(line));
  const selected = new Set(selection.ranges.flatMap(range => Array.from({ length: range.to - range.from + 1 }, (_, index) => range.from - 1 + index)));
  const excludedLines = lines.filter((line, index) => line.trim() && !selected.has(index)).length;
  const review = selection.uncertain || containsPaperMetadata || !text.trim();
  return { text: review ? '' : text, status: review ? 'review' : 'ready', excludedLines };
}
