'use client';

import { forwardRef, useId } from 'react';
import type { InputProps } from '@/types';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { id, label, hint, error, className = '', ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = `${inputId}-description`;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium">{label}</label>
      <input ref={ref} id={inputId} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptionId : undefined} className={`field ${className}`} {...props} />
      {(error || hint) && <p id={descriptionId} className={`text-sm ${error ? 'text-red-700' : 'text-muted'}`} role={error ? 'alert' : undefined}>{error || hint}</p>}
    </div>
  );
});
