import type { BadgeProps } from '@/types';

const tones = { neutral: 'bg-paper text-muted', accent: 'bg-accent-soft text-accent', warning: 'bg-amber-50 text-amber-800' };

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  return <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
