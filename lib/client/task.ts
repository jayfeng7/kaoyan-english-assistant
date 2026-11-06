'use client';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { messageFor } from './api';
import type { TaskOperation } from '@/types';
export function useTask() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const active = useRef<AbortController | undefined>(undefined); const lastOperation = useRef<TaskOperation | undefined>(undefined); const { notify } = useToast();
  useEffect(() => () => { active.current?.abort(); }, []);
  async function run<T>(operation: TaskOperation<T>): Promise<T | undefined> {
    if (active.current) return;
    const controller = new AbortController(); active.current = controller; lastOperation.current = operation; setBusy(true); setError(undefined);
    try { return await operation(controller.signal); } catch (failure) { if (!controller.signal.aborted) { const text = messageFor(failure); setError(text); notify(text, 'error'); } }
    finally { if (active.current === controller) active.current = undefined; setBusy(false); }
  }
  return { busy, error, run, retry: () => lastOperation.current ? run(lastOperation.current) : Promise.resolve(undefined), clearError: () => setError(undefined), cancel: () => active.current?.abort() };
}
