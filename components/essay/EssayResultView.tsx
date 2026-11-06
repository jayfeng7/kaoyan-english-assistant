import { ScoreCard } from './ScoreCard';
import { AnnotationList } from './AnnotationList';
import { EssayDetail } from './EssayDetail';
import { Card } from '@/components/ui/Card';
import { TextFallbackView } from '@/components/ui/TextFallbackView';
import { EssayProse } from './EssayProse';
import type { EssayReportProps } from '@/types';

export function EssayResultView({ record, expanded = false, part = 'all' }: EssayReportProps) {
  const result = record.result;
  if (!result) return null;
  if ('text' in result) {
    if (part === 'details' || expanded) return <TextFallbackView text={result.text} />;
    return <><Card className="space-y-2"><h2 className="text-lg font-semibold">本次未能给分</h2><p className="text-sm text-muted">可以继续讨论原文，或重新批改。</p></Card>{part === 'all' && <EssayDetail title="已有反馈"><TextFallbackView text={result.text} /></EssayDetail>}</>;
  }
  const reference = 'improvedEssay' in result ? result : result.reference;
  const summary = <>
    <ScoreCard value={result.scoreCard} max={record.composition === 'small' ? 10 : record.type === 'english1' ? 20 : 15} expanded={expanded} />
    <section><h2 className="text-xl font-semibold">总评</h2><p className="mt-3 whitespace-pre-wrap leading-7">{result.overallComment}</p></section>
    {result.suggestions.length > 0 && <Card className="px-4 py-4 sm:px-6"><h2 className="mb-3 text-base font-semibold">{expanded ? '下一步建议' : '修改建议'}</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-7">{(expanded ? result.suggestions : result.suggestions.slice(0, 2)).map((text, index) => <li key={index}>{text}</li>)}</ol></Card>}
    <section><h3 className="font-semibold">逐句批注</h3><div className="mt-3"><AnnotationList items={result.sentenceAnnotations} embedded /></div></section>
  </>;
  const details = <div className="space-y-6 text-sm leading-7">
    {!expanded && <section><h3 className="font-semibold">评分依据</h3><p className="mt-2 whitespace-pre-wrap">{result.scoreCard.bandReason}</p></section>}
    {reference ? <><section><h3 className="mb-3 font-semibold">改进版作文</h3><EssayProse text={reference.improvedEssay} /></section>
    <section><h3 className="mb-3 font-semibold">参考范文</h3><EssayProse text={reference.modelEssay} /></section>
    {reference.expressions.length > 0 && <section><h3 className="font-semibold">可积累表达</h3><dl className="mt-3 space-y-3">{reference.expressions.map((item, index) => <div key={index}><dt className="font-medium">{item.expression}</dt><dd>{item.meaning}<p className="text-muted">{item.example}</p></dd></div>)}</dl></section>}</> : expanded && <p>改进版与参考范文尚未生成，可在报告中展开后补充。</p>}
    {!expanded && <section><h3 className="font-semibold">题目与作文原文</h3><p className="mt-2 whitespace-pre-wrap">{record.prompt}</p><div className="mt-4 border-t border-line pt-4"><EssayProse text={record.essay} /></div></section>}
    {!expanded && result.suggestions.length > 2 && <section><h3 className="font-semibold">其他建议</h3><ol className="mt-2 list-decimal space-y-2 pl-5">{result.suggestions.slice(2).map((text, index) => <li key={index}>{text}</li>)}</ol></section>}
  </div>;
  if (part === 'summary') return summary;
  if (part === 'details') return details;
  return <>{summary}{expanded ? details : <EssayDetail title="改进版与参考">{details}</EssayDetail>}</>;
}
