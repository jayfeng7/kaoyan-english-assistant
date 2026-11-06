'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { ModalProps } from '@/types';

export function Modal({ open, title, children, onClose }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={() => { if (open) onClose(); }}
      onClick={(event) => { if (event.target !== event.currentTarget) return; const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose(); }}
      className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-line bg-white p-6 text-ink shadow-xl backdrop:bg-ink/30">
      <div className="mb-5 flex items-center justify-between gap-4"><h2 id={titleId} className="text-xl font-semibold">{title}</h2><button type="button" onClick={onClose} aria-label="关闭对话框" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-paper"><X className="h-5 w-5" /></button></div>
      {children}
    </dialog>
  );
}
