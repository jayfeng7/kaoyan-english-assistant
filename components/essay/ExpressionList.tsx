import { ResultSection } from '@/components/ui/ResultSection';
import type { ExpressionListProps } from '@/types';
export function ExpressionList({ items }: ExpressionListProps) { return <ResultSection title="可积累表达"><dl className="space-y-5">{items.map((item, index) => <div key={index} className="rounded-xl bg-paper p-4"><dt className="font-serif font-semibold text-accent">{item.expression}</dt><dd>{item.meaning}<p className="mt-2 font-serif text-muted">{item.example}</p></dd></div>)}</dl></ResultSection>; }
