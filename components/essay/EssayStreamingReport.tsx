'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ResultSection } from '@/components/ui/ResultSection';
import { AnnotationList } from './AnnotationList';
import { EssayDetail } from './EssayDetail';
import { ScoreCard } from './ScoreCard';
import type { EssayStreamingReportProps } from '@/types';

export function EssayStreamingReport({ preview, busy, stopped, startedAt, error, onStop, max = 20 }: EssayStreamingReportProps) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const update = () => setSeconds(Math.floor(Math.max(0, Date.now() - startedAt) / 1000));
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [busy, startedAt]);
  const hasPreview = Boolean(preview.overallComment || preview.sentenceAnnotations.length || preview.improvedEssay || preview.modelEssay);
  if (busy) return <div className="space-y-3">
    {preview.scoreCard && <ScoreCard value={preview.scoreCard} max={max} provisional />}
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-4 py-3"><p role="status" className="text-sm text-muted">{preview.scoreCard ? '整理批注…' : '正在评分…'}<span aria-live="off" className="ml-2">{seconds}秒</span></p><Button variant="ghost" onClick={onStop}>停止</Button></div>
    {preview.overallComment && <Card className="px-4 py-4"><h2 className="text-base font-semibold">总评</h2><p className="mt-2 whitespace-pre-wrap text-sm leading-7">{preview.overallComment}</p></Card>}
    {preview.sentenceAnnotations.length > 0 && <AnnotationList items={preview.sentenceAnnotations} embedded />}
  </div>;
  return <div className="space-y-5">
    <Card className="space-y-3 border-accent/20 bg-accent-soft">
      <p role="status" className="font-medium text-accent">{stopped ? '批改已停止' : '批改未完成'}</p>
      <p className="text-sm leading-6 text-muted">原文已保留，本次未保存分数。</p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!hasPreview && <p className="text-sm text-muted">可重新批改。</p>}
    </Card>
    {hasPreview && <EssayDetail title="已生成的内容"><div className="space-y-4">{preview.overallComment && <ResultSection title="评语"><p className="whitespace-pre-wrap">{preview.overallComment}</p></ResultSection>}{preview.sentenceAnnotations.length > 0 && <AnnotationList items={preview.sentenceAnnotations} embedded />}</div></EssayDetail>}
  </div>;
}
