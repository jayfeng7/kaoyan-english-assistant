'use client';
import { uuid } from '@/lib/utils/uuid';
import { z } from 'zod';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { AnalysisLoading } from '@/components/ui/AnalysisLoading';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { TextFallbackView } from '@/components/ui/TextFallbackView';
import { FollowUpInput } from '@/components/essay/FollowUpInput';
import { SentenceResultView } from './SentenceResultView';
import { useWorkspace, patchSentence } from '@/lib/client/workspace';
import { useTask } from '@/lib/client/task';
import { postApi } from '@/lib/client/api';
import { persistFeature, useRestoreHistory } from '@/lib/client/history';
import { sentenceAnalyzeRequestSchema, sentenceResultSchema } from '@/lib/schemas/sentence';
import { sentenceDataSchema } from '@/lib/schemas/storage';
import { textFallbackSchema } from '@/lib/schemas/common';
import { useToast } from '@/components/ui/Toast';
import type { HistoryFormProps, SentenceData } from '@/types';
export function SentenceForm({ historyId }: HistoryFormProps) {
  const draft = useWorkspace((state) => state.sentence); const ready = useWorkspace((state) => state.ready); const task = useTask(); const { notify } = useToast();
  const restoring = useRestoreHistory(historyId, 'sentence', sentenceDataSchema, (record) => patchSentence({ sentence: record.sentence, record }));
  const valid = sentenceAnalyzeRequestSchema.safeParse({ sentence: draft.sentence }).success;
  async function submit() { if (!valid) return; await task.run(async (signal) => { const response = await postApi('/api/sentence/analyze', { sentence: draft.sentence }, z.union([sentenceResultSchema, textFallbackSchema]), signal); const record: SentenceData = { id: uuid(), sentence: draft.sentence, createdAt: Date.now(), result: response.data, provider: response.provider }; patchSentence({ record }); if (response.provider && response.provider !== 'deepseek') notify('已切换到备用模型'); await persistFeature('sentence', record); }); }
  const record = draft.record; const result = record?.result;
  return <><div className="feature-grid"><Card><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}><Textarea label="英文长难句" value={draft.sentence} onChange={(event) => patchSentence({ sentence: event.target.value, record: undefined })} characterLimit={2000} rows={9} disabled={task.busy || restoring || !ready} placeholder="粘贴想要读懂的句子…" /><TaskFeedback error={task.error} onRetry={() => { void submit(); }} disabled={!valid || task.busy || restoring || !ready} /><Button type="submit" loading={task.busy} disabled={!valid || restoring || !ready}>分析句子</Button></form></Card><div className="min-w-0 space-y-5"><div aria-busy={task.busy}>{task.busy ? <AnalysisLoading label="正在拆解句子…" /> : result ? 'text' in result ? <TextFallbackView text={result.text} /> : <SentenceResultView result={result} /> : <Card><h2 className="text-xl font-semibold">{task.busy ? '正在拆解句子…' : '从主干到细节'}</h2><p className="mt-3 text-sm leading-7 text-muted">依次查看意群、主干、从句、修饰、翻译、语法点与仿写。</p></Card>}</div><FollowUpInput key={record?.id ?? 'empty'} record={record} disabled={task.busy || restoring || !ready} onChange={(updated) => { if (useWorkspace.getState().sentence.record?.id === updated.id) patchSentence({ record: updated }); }} /></div></div></>;
}
