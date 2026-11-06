import type { SkeletonProps } from '@/types';

export function Skeleton({ className = '', label = '正在加载' }: SkeletonProps) {
  return <div role="status" className={`animate-pulse rounded-xl bg-line/70 ${className}`}><span className="sr-only">{label}</span></div>;
}
