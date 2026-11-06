'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { postApi, requestApi, ClientFailure } from '@/lib/client/api';
import { useTask } from '@/lib/client/task';
import { essayIdentificationSchema } from '@/lib/schemas/essay-identification';
import type { EssayIdentification } from '@/lib/schemas/essay-identification';
import { essayBankItemSchema } from '@/lib/schemas/essay-bank';
import type { EssayBankItem, EssayInputEvidence } from '@/types';

export function EssayTaskMatcher({ essay, prompt, inputEvidence, disabled, onBusyChange, onSelect }: { essay: string; prompt: string; inputEvidence?: EssayInputEvidence; disabled: boolean; onBusyChange: (busy: boolean) => void; onSelect: (item: EssayBankItem) => void }) {
  const task = useTask();
  const key = JSON.stringify([essay,prompt]); const latest = useRef(key);
  useEffect(() => { latest.current = key; }, [key]);
  useEffect(() => { onBusyChange(task.busy); return () => onBusyChange(false); }, [task.busy,onBusyChange]);
  const [snapshot,setSnapshot] = useState<{ key: string; data: EssayIdentification }>();
  const result = snapshot?.key === key ? snapshot.data : undefined;
  const enough = (essay.match(/[A-Za-z]+/g)?.length ?? 0) >= 20;
  async function match() {
    await task.run(async signal => {
      const { data } = await postApi('/api/essay/identify', { essay,prompt,inputEvidence }, essayIdentificationSchema,signal);
      if (!signal.aborted && latest.current === key) setSnapshot({ key,data });
    });
  }
  async function adopt(candidate: EssayIdentification['candidates'][number]) {
    await task.run(async signal => {
      const { data } = await requestApi(`/api/essay/bank/${encodeURIComponent(candidate.id)}`,essayBankItemSchema,{signal});
      if(signal.aborted || latest.current !== key) return;
      if(data.id!==candidate.id || data.type!==candidate.type || data.composition!==candidate.composition || data.year!==candidate.year) throw new ClientFailure('候选题目已变化，请重新匹配或手动选择。');
      onSelect(data);
    });
  }
  return <div className="space-y-3 rounded-xl border border-line bg-paper/50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">不确定作文对应哪道真题？</p><Button variant="secondary" disabled={disabled || !enough} loading={task.busy} onClick={() => { void match(); }}>匹配参考题目</Button>{task.busy && <Button variant="ghost" onClick={task.cancel}>停止匹配</Button>}</div>
    <p className="text-xs leading-6 text-muted">根据正文和题面查找候选，需对照原题确认后采用。日期和图表年份不能直接当作考试年份；上传正文仍需单独校对。</p>
    {!enough && <p className="text-xs text-muted">请先输入或识别至少20个英文词；信息太少时可手动选择题目。</p>}
    <TaskFeedback error={task.error} disabled={disabled || !enough} onRetry={() => { void match(); }} />
    {result && <div className="space-y-3" aria-live="polite"><p className="text-sm">{result.status==='unknown' ? '暂未找到可靠匹配，请补充题面或手动选择。' : result.status==='ambiguous' ? '以下题目可能相关，当前无法确定，请逐项核对。' : '找到以下候选题目，请对照原题核对。'}</p>
      {result.candidates.map(candidate => <div key={candidate.id} className="space-y-2 rounded-lg border border-line bg-white p-3"><p className="text-sm font-medium">{candidate.title}</p><p className="text-sm text-muted">{candidate.reason}</p><blockquote className="whitespace-pre-wrap border-l-2 border-line pl-3 text-sm">{candidate.evidence.join('\n')}</blockquote><Button variant="secondary" disabled={disabled} onClick={() => { void adopt(candidate); }}>核对后采用此题</Button></div>)}
      <ul className="list-disc space-y-1 pl-5 text-xs leading-6 text-muted">{result.limitations.map((limitation,index)=><li key={index}>{limitation}</li>)}</ul>
    </div>}
  </div>;
}
