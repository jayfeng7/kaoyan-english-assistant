import type { CardProps } from '@/types';

export function Card({ as: Element = 'section', className = '', children, ...props }: CardProps) {
  return <Element className={`min-w-0 rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6 ${className}`} {...props}>{children}</Element>;
}
