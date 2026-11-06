import { EssayResultView } from './EssayResultView';
import { EssayProse } from './EssayProse';
import type { EssayReportProps } from '@/types';

export function EssayPrintReport({ record }: EssayReportProps) {
  if (!record.result) return null;
  return <section data-essay-report className="hidden" aria-label="作文批改报告">
    <header><h1>考研英语 · 作文批改报告</h1><p>{record.type === 'english1' ? '英语一' : '英语二'} · {record.composition === 'big' ? '大作文' : '小作文'} · {record.wordCount} 词</p>{record.sourceLabel && <p>{record.sourceLabel}</p>}<p>分数供练习参考。</p></header>
    <section><h2>题目与要求</h2><p className="whitespace-pre-wrap">{record.prompt}</p></section>
    <section><h2>作文原文</h2><EssayProse text={record.essay} /></section>
    <EssayResultView record={record} expanded />
  </section>;
}
