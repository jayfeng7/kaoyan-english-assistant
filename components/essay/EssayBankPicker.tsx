'use client';
import { useEffect, useRef, useState } from 'react';
import { SelectField } from '@/components/ui/SelectField';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { Skeleton } from '@/components/ui/Skeleton';
import { requestApi, messageFor } from '@/lib/client/api';
import { essayBankItemSchema, essayBankListSchema } from '@/lib/schemas/essay-bank';
import type { EssayBankMeta, EssayBankPickerProps } from '@/types';

export function EssayBankPicker({ draft, onSelect, onClear, disabled }: EssayBankPickerProps) {
  const selectRef = useRef(onSelect);
  useEffect(() => { selectRef.current = onSelect; }, [onSelect]);
  const [items, setItems] = useState<EssayBankMeta[]>([]); const [year, setYear] = useState(''); const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [revision, setRevision] = useState(0);
  const [detailError, setDetailError] = useState<string>(); const [detailRevision, setDetailRevision] = useState(0); const [detailLoading, setDetailLoading] = useState(false);
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void requestApi(`/api/essay/bank?type=${draft.type}&composition=${draft.composition}`, essayBankListSchema, { signal: controller.signal }).then(({ data }) => { if (active) setItems(data.items); }).catch((failure: unknown) => { if (active) setError(messageFor(failure)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [draft.type, draft.composition, revision]);
  useEffect(() => {
    if (!selected) return;
    let active = true; const controller = new AbortController();
    void requestApi(`/api/essay/bank/${encodeURIComponent(selected)}`, essayBankItemSchema, { signal: controller.signal }).then(({ data }) => { if (!active) return; if (data.id !== selected || data.type !== draft.type || data.composition !== draft.composition) { setDetailError('题目与所选题型不匹配，请重试'); return; } setDetailLoading(false); setSelected(''); selectRef.current(data); }).catch((failure: unknown) => { if (active) setDetailError(messageFor(failure)); }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [selected, detailRevision, draft.type, draft.composition]);
  return <div className="space-y-3"><SelectField label="作文年份" value={year || (draft.year ? String(draft.year) : '')} disabled={disabled || loading || detailLoading} onChange={(event) => {
    const value = event.target.value; setYear(value); setDetailError(undefined); onClear();
    const item = items.find(entry => entry.year === Number(value));
    setSelected(item?.id ?? ''); setDetailLoading(Boolean(item));
  }}><option value="">选择年份，自动载入题目</option>{[...new Set(items.map(item => item.year))].sort((a,b) => b-a).map(value => <option key={value} value={value}>{value < 2010 ? `${value}（早期旧卷）` : `${value} 年`}</option>)}</SelectField>
    <TaskFeedback error={error} disabled={loading || disabled} onRetry={() => { setLoading(true); setError(undefined); setItems([]); setYear(''); setSelected(''); setRevision(value => value + 1); }} />
    <TaskFeedback error={detailError} disabled={detailLoading || disabled} onRetry={() => { setDetailLoading(true); setDetailError(undefined); setDetailRevision(value => value + 1); }} />
    {(loading || detailLoading) && <Skeleton className="h-12" label="正在读取作文真题…" />}
    {!loading && !error && !items.length && <p className="text-sm text-muted">该题型暂无题目，可使用自由批改。</p>}
  </div>;
}
