'use client';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import type { OcrReviewProps, ReactNode } from '@/types';
export function OcrReview({ result, text, onChange, onConfirm, busy, valid, confirmed, heading = '手写识别校对', textLabel = '校对后的作文', characterLimit = 8000, showConfirm = true, confirmLabel = '确认无误，开始批改', automatic = false }: OcrReviewProps) {
  if (automatic) return <div className="space-y-3">
    {result.lowConfidenceWords.length > 0 && <p className="flex flex-wrap items-center gap-2 text-sm text-muted">请核对：{result.lowConfidenceWords.map((word, index) => <mark key={index} className="rounded bg-amber-100 px-1 text-amber-900">{word.word}</mark>)}</p>}
    <Textarea label={textLabel} value={text} onChange={event => onChange(event.target.value)} rows={6} className="essay-editor" characterLimit={characterLimit} disabled={busy} />
  </div>;
  const fragments: ReactNode[] = []; let position = 0;
  for (const [index, word] of [...result.lowConfidenceWords].sort((a, b) => a.start - b.start).entries()) { if (word.start < position) continue; fragments.push(result.text.slice(position, word.start)); fragments.push(<mark key={index} className="bg-yellow-200 underline decoration-yellow-700 underline-offset-4" title={`置信度 ${Math.round(word.confidence * 100)}%`}>{result.text.slice(word.start, word.end)}</mark>); position = word.end; }
  fragments.push(result.text.slice(position));
  return <Card className="space-y-4 border-amber-200"><div><h2 className="text-xl font-semibold">{heading}</h2><p className="mt-2 text-sm text-muted">整体置信度 {Math.round(result.confidence * 100)}%。黄色下划线标出低置信度片段。</p></div>{result.confidence < 0.6 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-amber-900">识别置信度较低，请仔细校对。</p>}<div><p className="text-sm text-muted">识别原文</p><p className="reading mt-3 whitespace-pre-wrap rounded-xl bg-paper p-4 leading-8">{fragments}</p></div><Textarea label={textLabel} value={text} onChange={(event) => onChange(event.target.value)} rows={10} characterLimit={characterLimit} disabled={busy} hint="请逐字检查。修改后需要重新确认，才能提交批改。" />{showConfirm && <Button onClick={onConfirm} disabled={!valid} loading={busy}>{confirmLabel}</Button>}{confirmed && <p className="text-sm text-accent">已确认当前校对文本。</p>}</Card>;
}
