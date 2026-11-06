'use client';

import { forwardRef, useId } from 'react';
import type { TextareaProps } from '@/types';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { id, label, hint, error, characterLimit, value, className = '', rows = 7, ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  const countId = `${inputId}-count`;
  const count = typeof value === 'string' ? value.length : undefined;
  const overLimit = count !== undefined && characterLimit !== undefined && count > characterLimit;
  const descriptionIds = [error || hint || overLimit ? descriptionId : '', count !== undefined && characterLimit !== undefined ? countId : ''].filter(Boolean).join(' ');
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <textarea ref={ref} id={inputId} rows={rows} value={value} aria-invalid={Boolean(error || overLimit)} aria-describedby={descriptionIds || undefined} className={`field resize-y leading-7 ${className}`} {...props} />
      <div className="flex items-start justify-between gap-3 text-sm">
        {(error || hint || overLimit) && <p id={descriptionId} className={error || overLimit ? 'text-red-700' : 'text-muted'} role={error || overLimit ? 'alert' : undefined}>{error || (overLimit ? `超过 ${characterLimit} 字上限，请拆分或缩短后提交；原文已保留。` : hint)}</p>}
        {count !== undefined && characterLimit !== undefined && <p id={countId} className={`ml-auto shrink-0 tabular-nums ${overLimit ? 'text-red-700' : 'text-muted'}`}>{count} / {characterLimit}</p>}
      </div>
    </div>
  );
});
