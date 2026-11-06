'use client';

import { lazy, Suspense } from 'react';
import type { MarkdownProps } from '@/types';

const SafeMarkdown = lazy(() => import('./SafeMarkdown'));

export function Markdown({ content, className = '' }: MarkdownProps) {
  return (
    <div className={`markdown ${className}`}>
      <Suspense fallback={<div className="whitespace-pre-wrap">{content}</div>}><SafeMarkdown content={content} /></Suspense>
    </div>
  );
}
