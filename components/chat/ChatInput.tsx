'use client';
import { useId, useLayoutEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { ChatInputProps } from '@/types';
export function ChatInput({ value, onChange, onSend, onStop, loading, disabled, label = '输入问题', placeholder = '输入问题，继续追问…' }: ChatInputProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const inputId = useId();
  useLayoutEffect(() => {
    const resize = () => { if (field.current) { const element = field.current; element.style.height = 'auto'; element.style.height = `${Math.min(element.scrollHeight + element.offsetHeight - element.clientHeight, 128)}px`; } };
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [value]);
  return <form onSubmit={(event) => { event.preventDefault(); if (!disabled && !loading && value.trim()) onSend(); }} className="mx-auto flex w-full max-w-4xl items-end gap-2">
    <label htmlFor={inputId} className="sr-only">{label}</label>
    <textarea id={inputId} ref={field} rows={1} className="field max-h-32 min-h-12 flex-1 resize-none py-2.5 leading-7" value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || loading} placeholder={placeholder} />
    {loading ? <Button aria-label="停止回答" variant="secondary" onClick={onStop} className="h-12 shrink-0 px-3"><Square aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">停止</span></Button> : <Button aria-label="发送问题" type="submit" disabled={disabled || !value.trim()} className="h-12 w-12 shrink-0 px-0"><ArrowUp aria-hidden="true" className="h-5 w-5" /></Button>}
  </form>;
}
