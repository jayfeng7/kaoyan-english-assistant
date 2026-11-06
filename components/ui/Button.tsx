'use client';

import { forwardRef } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { ButtonProps } from '@/types';

const variants = {
  primary: 'bg-accent text-white hover:bg-accent/90',
  secondary: 'border border-line bg-white text-ink hover:border-accent/40 hover:bg-paper',
  ghost: 'text-accent hover:bg-accent-soft',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', loading = false, disabled, children, className = '', type = 'button', ...props }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`} {...props}>
      {loading && <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
});
