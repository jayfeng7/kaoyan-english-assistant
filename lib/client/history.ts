'use client';
import { useEffect, useRef, useState } from 'react';
import { getHistory, createHistoryRecord, saveHistory } from '@/lib/storage/history';
import { useToast } from '@/components/ui/Toast';
import type { HistoryRecord, HistoryType, Schema } from '@/types';

export function useRestoreHistory<T>(id: string | undefined, type: HistoryType, schema: Schema<T>, onRestore: (data: T) => void): boolean {
  const [settledKey, setSettledKey] = useState<string>(); const restore = useRef(onRestore);
  const restoreKey = `${type}:${id ?? ''}`;
  const loading = Boolean(id) && settledKey !== restoreKey;
  const { notify } = useToast();
  useEffect(() => { restore.current = onRestore; }, [onRestore]);
  useEffect(() => {
    if (!id) return;
    let active = true;
    void getHistory(id).then((record) => {
      if (!active) return;
      const result = record?.type === type ? schema.safeParse(record.data) : undefined;
      if (result?.success) restore.current(result.data); else notify('未找到可恢复的记录，请重新选择', 'error');
    }).catch(() => { if (active) notify('历史读取失败，当前输入已保留', 'error'); }).finally(() => { if (active) setSettledKey(restoreKey); });
    return () => { active = false; };
  }, [id, type, schema, notify, restoreKey]);
  return loading;
}
export async function persistFeature(type: HistoryType, data: HistoryRecord['data']): Promise<void> { await saveHistory(createHistoryRecord(type, data)); }
