import { Card } from './Card';
import { Skeleton } from './Skeleton';
import type { AnalysisLoadingProps } from '@/types';

export function AnalysisLoading({ label }: AnalysisLoadingProps) {
  return <Card role="status" aria-live="polite" className="space-y-5">
    <p className="text-sm leading-7 text-muted">{label} 输入内容已保留。</p>
    <div aria-hidden="true" className="space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24" /><Skeleton className="h-16" /></div>
  </Card>;
}
