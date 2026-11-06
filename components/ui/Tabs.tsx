'use client';

import { useId } from 'react';
import type { TabsProps } from '@/types';

export function Tabs({ label, items, value, onChange, children }: TabsProps) {
  const id = useId();
  const selected = items.find((item) => item.id === value);
  return (
    <div>
      <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto rounded-xl bg-paper p-1">
        {items.map((item) => <button key={item.id} id={`${id}-tab-${item.id}`} type="button" role="tab" disabled={item.disabled}
          aria-selected={value === item.id} aria-controls={`${id}-panel`} tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)} onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const enabled = items.filter((tab) => !tab.disabled);
            const index = enabled.findIndex((tab) => tab.id === item.id);
            const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length;
            const next = enabled[nextIndex];
            if (next) { onChange(next.id); document.getElementById(`${id}-tab-${next.id}`)?.focus(); }
          }} className={`min-h-11 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm transition disabled:opacity-40 ${value === item.id ? 'bg-white font-medium text-accent shadow-sm' : 'text-muted hover:text-ink'}`}>{item.label}</button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={selected ? `${id}-tab-${selected.id}` : undefined} tabIndex={0}>{children}</div>
    </div>
  );
}
