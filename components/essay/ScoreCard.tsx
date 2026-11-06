import { Card } from '@/components/ui/Card';
import type { ScoreCardProps } from '@/types';
export function ScoreCard({ value, max, expanded = false, provisional = false }: ScoreCardProps) {
  return <Card className="border-accent/20 px-4 py-4 sm:px-6 sm:py-6">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="text-base font-semibold sm:text-xl">{provisional ? '暂评' : '评分'}</h2><p className="mt-2 text-sm text-muted">{value.band.name}{expanded ? ` · ${value.band.range}` : ''}</p></div>
      <p aria-label={`${value.score} 分，满分 ${max} 分`} className="shrink-0 font-serif text-5xl text-accent sm:text-6xl">{value.score}<span className="ml-1 text-lg text-muted sm:ml-2 sm:text-xl">/ {max}</span></p>
    </div>
    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3 sm:mt-5 sm:pt-4">{([{ key: 'content', label: '内容' }, { key: 'language', label: '语言' }, { key: 'structure', label: '结构' }] as const).map(({ key, label }) => <div key={key} className="flex items-baseline justify-center gap-2 rounded-lg bg-paper px-1 py-2 sm:block sm:rounded-xl sm:px-2 sm:py-3"><dt className="text-xs text-muted sm:text-sm">{label}</dt><dd className="font-serif text-xl sm:mt-1 sm:text-2xl">{value.breakdown[key]}</dd></div>)}</dl>
    {expanded && <p className="reading mt-4 whitespace-pre-wrap text-sm leading-7"><span className="font-medium">评分依据：</span>{value.bandReason}</p>}
    {provisional && <p className="mt-3 text-xs text-muted">批改尚未完成，分数暂不保存。</p>}
  </Card>;
}
