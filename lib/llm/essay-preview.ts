import 'server-only';
import { sentenceAnnotationSchema } from '@/lib/schemas/essay';
import type { EssayPreviewField, EssayStreamEvent, Schema, ScoreCard } from '@/types';

function previewField(key: string): key is EssayPreviewField {
  return key === 'overallComment' || key === 'improvedEssay' || key === 'modelEssay';
}

// Decode only complete escapes. A split \\uXXXX or trailing backslash waits for
// its next chunk; raw JSON, score fields and incomplete annotation objects never
// enter the preview. Final validation remains independent of this extractor.
function decodePrefix(raw: string): string | undefined {
  let end = raw.length;
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] !== '\\') continue;
    const count = raw[index + 1] === 'u' ? 6 : 2;
    if (index + count > raw.length) { end = index; break; }
    index += count - 1;
  }
  try { const value: unknown = JSON.parse(`"${raw.slice(0, end)}"`); return typeof value === 'string' ? value : undefined; }
  catch { return undefined; }
}

export class EssayPreviewReader {
  private buffer = '';
  private depth = 0;
  private started = false;
  private closed = false;
  private quoted = false;
  private escaped = false;
  private tokenStart = 0;
  private keyToken = false;
  private expectKey = true;
  private key = '';
  private activeField: EssayPreviewField | undefined;
  private annotationStart: number | undefined;
  private scoreStart: number | undefined;
  private scoreShown = false;
  private shown: Partial<Record<EssayPreviewField, string>> = {};

  constructor(private readonly scoreSchema?: Schema<ScoreCard>) {}

  push(chunk: string): EssayStreamEvent[] {
    const offset = this.buffer.length; this.buffer += chunk;
    const events: EssayStreamEvent[] = [];
    const emit = (end: number) => {
      if (!this.activeField) return;
      const text = decodePrefix(this.buffer.slice(this.tokenStart + 1, end));
      const previous = this.shown[this.activeField] ?? '';
      if (text !== undefined && text.startsWith(previous) && text.length > previous.length) {
        this.shown[this.activeField] = text;
        // Send only the new characters, never the entire growing paragraph.
        events.push({ type: 'preview', field: this.activeField, text: text.slice(previous.length) });
      }
    };
    for (let index = offset; index < this.buffer.length; index++) {
      const char = this.buffer[index];
      if (this.closed) break;
      if (this.quoted) {
        if (this.escaped) { this.escaped = false; continue; }
        if (char === '\\') { this.escaped = true; continue; }
        if (char !== '"') continue;
        this.quoted = false;
        if (this.keyToken) {
          try { const key: unknown = JSON.parse(this.buffer.slice(this.tokenStart, index + 1)); this.key = typeof key === 'string' ? key : ''; } catch { this.key = ''; }
          this.expectKey = false;
        } else emit(index);
        this.activeField = undefined;
        continue;
      }
      if (!this.started) { if (char === '{') { this.started = true; this.depth = 1; } continue; }
      if (char === '"') {
        this.quoted = true; this.tokenStart = index;
        this.keyToken = this.depth === 1 && this.expectKey;
        this.activeField = this.depth === 1 && !this.keyToken && previewField(this.key) ? this.key : undefined;
      } else if (char === '{' || char === '[') {
        if (char === '{' && this.depth === 1 && this.key === 'scoreCard') this.scoreStart = index;
        if (char === '{' && this.depth === 2 && this.key === 'sentenceAnnotations') this.annotationStart = index;
        this.depth++;
      } else if (char === '}' || char === ']') {
        this.depth--;
        if (char === '}' && this.depth === 1 && this.scoreStart !== undefined && this.scoreSchema && !this.scoreShown) {
          try {
            const raw: unknown = JSON.parse(this.buffer.slice(this.scoreStart, index + 1));
            const checked = this.scoreSchema.safeParse(raw);
            if (checked.success) { events.push({ type: 'score', scoreCard: checked.data }); this.scoreShown = true; }
          } catch { /* Never show a partial or invalid score. */ }
          this.scoreStart = undefined;
        }
        if (char === '}' && this.depth === 2 && this.annotationStart !== undefined) {
          try {
            const raw: unknown = JSON.parse(this.buffer.slice(this.annotationStart, index + 1));
            const checked = sentenceAnnotationSchema.safeParse(raw);
            if (checked.success) events.push({ type: 'annotation', annotation: checked.data });
          } catch { /* Incomplete/invalid objects are never previewed. */ }
          this.annotationStart = undefined;
        }
        if (this.depth === 0) this.closed = true;
      } else if (char === ',' && this.depth === 1) { this.expectKey = true; this.key = ''; }
    }
    if (this.quoted && !this.keyToken) emit(this.buffer.length);
    return events;
  }
}
