'use client';
import { EssayDetail } from './EssayDetail';
import { EssayResultView } from './EssayResultView';
import { Button } from '@/components/ui/Button';
import { useTask } from '@/lib/client/task';
import { postApi } from '@/lib/client/api';
import { essayReferenceSchema } from '@/lib/schemas/essay';
import type { EssayReferenceProps } from '@/types';

export function EssayReference({ record, onChange }: EssayReferenceProps) {
  const task = useTask();
  const result = record.result;
  const missing = result && 'kind' in result && result.kind === 'core' && !result.reference;
  function load() {
    if (!missing || task.busy || task.error) return;
    void task.run(async signal => {
      const response = await postApi('/api/essay/reference', { type: record.type, composition: record.composition, prompt: record.prompt, essay: record.essay, source: record.source, bankId: record.bankId }, essayReferenceSchema, signal);
      signal.throwIfAborted();
      await onChange({ ...record, result: { ...result, reference: response.data } });
    });
  }
  return <EssayDetail title={result && 'text' in result ? '已有反馈' : '改进版与参考'} onOpen={load}>
    {missing && !task.busy && !task.error && <p className="text-sm text-muted">展开后生成写作参考。</p>}
    {task.busy && <div role="status" className="flex items-center gap-3 text-sm text-muted">正在整理参考…<Button variant="ghost" onClick={task.cancel}>停止</Button></div>}
    {task.error && <div role="alert" className="flex items-center gap-3 text-sm text-red-700">{task.error}<Button variant="ghost" onClick={() => { void task.retry(); }}>重试</Button></div>}
    <EssayResultView record={record} part="details" />
  </EssayDetail>;
}
