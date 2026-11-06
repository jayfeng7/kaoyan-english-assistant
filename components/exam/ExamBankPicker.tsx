'use client';
import { useEffect, useState } from 'react';
import { SelectField } from '@/components/ui/SelectField';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { requestApi, messageFor } from '@/lib/client/api';
import { examBankItemSchema } from '@/lib/schemas/exam';
import { examBankListSchema } from '@/lib/schemas/api';
import type { ExamBankMeta, ExamBankPickerProps } from '@/types';

export function ExamBankPicker({ draft, onChange, disabled }: ExamBankPickerProps) {
  const [items, setItems] = useState<ExamBankMeta[]>([]);
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string>();
  const [detailFailure, setDetailFailure] = useState<string>();
  const [failedBankId, setFailedBankId] = useState('');
  const [listRevision, setListRevision] = useState(0);
  const [detailRevision, setDetailRevision] = useState(0);
  const { notify } = useToast();
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void requestApi(`/api/exam/bank?type=${draft.type}`, examBankListSchema, { signal: controller.signal })
      .then(({ data }) => { if (active) setItems(data.items); })
      .catch((error: unknown) => { if (active) { const text = messageFor(error); setListError(text); notify(text, 'error'); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [draft.type, notify, listRevision]);
  const bankId = draft.bankId;
  const detailError = failedBankId === bankId ? detailFailure : undefined;
  const detailLoading = Boolean(bankId && draft.bankItem?.id !== bankId && !detailError);
  useEffect(() => {
    if (!bankId || draft.bankItem?.id === bankId) return;
    let active = true; const controller = new AbortController();
    void requestApi(`/api/exam/bank/${encodeURIComponent(bankId)}`, examBankItemSchema, { signal: controller.signal })
      .then(({ data }) => { if (active) onChange({ bankItem: data }); })
      .catch((error: unknown) => { if (active) { const text = messageFor(error); setFailedBankId(bankId); setDetailFailure(text); notify(text, 'error'); } });
    return () => { active = false; controller.abort(); };
  }, [bankId, draft.bankItem?.id, notify, onChange, detailRevision]);
  const years = [...new Set(items.map((item) => item.year))].sort((a, b) => b - a);
  const visible = items.filter((item) => !year || item.year === Number(year));
  return <div className="space-y-4">
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="真题年份" value={year} disabled={disabled || loading} onChange={(event) => { setYear(event.target.value); setDetailFailure(undefined); onChange({ bankId: '', bankItem: undefined, questionId: '', userAnswer: '', record: undefined }); }}>
        <option value="">全部年份</option>{years.map((value) => <option key={value} value={value}>{value}{value < 2010 ? '（早期旧卷）' : ''}</option>)}
      </SelectField>
      <SelectField label="阅读文章" value={visible.some((item) => item.id === bankId) ? bankId : ''} disabled={disabled || loading} onChange={(event) => { setDetailFailure(undefined); onChange({ bankId: event.target.value, bankItem: undefined, questionId: '', userAnswer: '', record: undefined }); }}>
        <option value="">{loading ? '正在读取题库…' : '请选择一篇文章'}</option>{visible.map((item) => <option key={item.id} value={item.id}>{item.year} · {item.section}{item.year < 2010 ? ' · 早期旧卷' : ''}{item.title ? ` · ${item.title}` : ''}</option>)}
      </SelectField>
    </div>
    <TaskFeedback error={listError} disabled={disabled || loading} onRetry={() => { setLoading(true); setItems([]); setYear(''); setListError(undefined); setListRevision((value) => value + 1); }} />
    <TaskFeedback error={detailError} disabled={disabled || detailLoading} onRetry={() => { setDetailFailure(undefined); setDetailRevision((value) => value + 1); }} />
    {(loading || detailLoading) && <Skeleton className="h-20" label="正在读取真题…" />}
    {!loading && !listError && !items.length && <p className="text-sm text-muted">题库暂无内容，请使用粘贴文章或 PDF 入口。</p>}
    {draft.bankItem && <SelectField label="选择题目" value={draft.questionId || draft.bankItem.questions[0]?.id || ''} disabled={disabled || detailLoading} onChange={(event) => onChange({ questionId: event.target.value, userAnswer: '', record: undefined })}>
      {draft.bankItem.questions.map((question, index) => <option key={question.id} value={question.id}>第 {index + 1} 题 · {question.question.slice(0, 70)}</option>)}
    </SelectField>}
  </div>;
}
