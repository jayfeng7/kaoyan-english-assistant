'use client';
import { Button } from './Button';
import type { TaskFeedbackProps } from '@/types';

export function TaskFeedback({ error, onRetry, disabled }: TaskFeedbackProps) {
  if (!error) return null;
  return <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950">
    <p>{error}</p><p>输入内容已保留，可以重试或调整后再提交。</p>
    {onRetry && <Button variant="secondary" disabled={disabled} onClick={onRetry}>重试</Button>}
  </div>;
}
