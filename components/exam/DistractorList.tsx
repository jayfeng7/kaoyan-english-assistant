import { ResultSection } from '@/components/ui/ResultSection';
import type { DistractorListProps } from '@/types';
export function DistractorList({ items }: DistractorListProps) { return <ResultSection title="干扰项分析">{items.map((item, index) => <div key={index} className="rounded-xl border border-line p-4"><p className="font-serif font-semibold">{item.option} · {item.text}</p><p className="mt-2 text-muted">{item.reason}</p></div>)}{!items.length && <p className="text-muted">本次没有可分析的干扰项。</p>}</ResultSection>; }
