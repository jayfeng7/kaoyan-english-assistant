import { ChevronDown } from 'lucide-react';
import type { EssayDetailProps } from '@/types';

export function EssayDetail({ title, description, children, onOpen }: EssayDetailProps) {
  return <details className="essay-detail group rounded-2xl border border-line bg-white" onToggle={onOpen ? event => { if (event.currentTarget.open) onOpen(); } : undefined}>
    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-6 sm:py-5">
      <span><span className="block font-medium text-ink">{title}</span>{description && <span className="mt-1 block text-sm font-normal text-muted">{description}</span>}</span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
    </summary>
    <div className="min-w-0 border-t border-line p-5 sm:p-6">{children}</div>
  </details>;
}
