'use client';
import { uuid } from '@/lib/utils/uuid';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, Info, X } from 'lucide-react';
import type { ChildrenProps, ToastContextValue, ToastMessage } from '@/types';

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: ChildrenProps) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const dismiss = useCallback((id: string) => setMessages((current) => current.filter((message) => message.id !== id)), []);
  const notify = useCallback<ToastContextValue['notify']>((text, tone = 'info') => {
    const id = uuid();
    setMessages((current) => [...current.slice(-3), { id, text, tone }]);
    const timer = setTimeout(() => { dismiss(id); timers.current.delete(timer); }, 6000);
    timers.current.add(timer);
  }, [dismiss]);
  useEffect(() => { const activeTimers = timers.current; return () => { activeTimers.forEach(clearTimeout); activeTimers.clear(); }; }, []);
  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div data-toast-region className="pointer-events-none fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md flex-col gap-3">
        {messages.map((message) => <div key={message.id} role={message.tone === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-4 shadow-lg ${message.tone === 'error' ? 'border-red-200 text-red-800' : 'border-line text-ink'}`}>
          {message.tone === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
          <p className="flex-1 text-sm leading-6">{message.text}</p>
          <button type="button" onClick={() => dismiss(message.id)} aria-label="关闭提示" className="-m-2 grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-paper"><X className="h-4 w-4" /></button>
        </div>)}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}
