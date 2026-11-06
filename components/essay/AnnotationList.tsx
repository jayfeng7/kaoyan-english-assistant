import { ResultSection } from '@/components/ui/ResultSection';
import { Badge } from '@/components/ui/Badge';
import type { AnnotationListProps } from '@/types';
export function AnnotationList({ items, embedded = false }: AnnotationListProps) {
  const content = <><ol className="space-y-5">{items.map((item, index) => <li key={`${item.index}-${index}`} className="rounded-xl border border-line p-4"><div className="mb-3 flex gap-2 text-sm"><span>第 {item.index} 句</span><Badge tone={item.type === 'problem' ? 'warning' : item.type === 'highlight' ? 'accent' : 'neutral'}>{item.type === 'problem' ? '问题句' : item.type === 'highlight' ? '亮点句' : '说明'}</Badge></div><blockquote className="border-l-2 border-accent/30 pl-4 font-serif">{item.original}</blockquote><p className="mt-3">{item.comment}</p>{item.correction && <p className="mt-2 rounded-lg bg-paper p-3"><span className="font-medium">建议改为：</span>{item.correction}</p>}{item.grammarPoint && <p className="mt-2 text-sm text-muted">语法点：{item.grammarPoint}</p>}</li>)}</ol>{items.length === 0 && <p className="text-muted">本次未返回逐句批注。</p>}</>;
  return embedded ? content : <ResultSection title="逐句批注">{content}</ResultSection>;
}
