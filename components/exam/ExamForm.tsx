'use client';
import { uuid } from '@/lib/utils/uuid';
import { z } from 'zod';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { AnalysisLoading } from '@/components/ui/AnalysisLoading';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { Tabs } from '@/components/ui/Tabs';
import { ResultSection } from '@/components/ui/ResultSection';
import { TextFallbackView } from '@/components/ui/TextFallbackView';
import { FollowUpInput } from '@/components/essay/FollowUpInput';
import { useToast } from '@/components/ui/Toast';
import { ExamBankPicker } from './ExamBankPicker';
import { PassageAnalysis } from './PassageAnalysis';
import { QuestionAnalysis } from './QuestionAnalysis';
import { DistractorList } from './DistractorList';
import { useWorkspace, patchExam } from '@/lib/client/workspace';
import { useTask } from '@/lib/client/task';
import { postApi, requestApi }
from '@/lib/client/api';
import { AppError } from '@/lib/utils/errors';
import { PDF_MAX_BYTES, pdfTextResultSchema } from '@/lib/schemas/exam';
import { persistFeature, useRestoreHistory } from '@/lib/client/history';
import { examAnalyzeRequestSchema, examResultSchema, examSourceSchema } from '@/lib/schemas/exam';
import { examDataSchema } from '@/lib/schemas/storage';
import { examTypeSchema, textFallbackSchema } from '@/lib/schemas/common';
import type { ExamData, ExamDraft, HistoryFormProps } from '@/types';

export function ExamForm({ historyId }: HistoryFormProps) {
  const draft = useWorkspace((state) => state.exam); const ready = useWorkspace((state) => state.ready); const task = useTask(); const pdfTask = useTask(); const { notify } = useToast();
  const restoring = useRestoreHistory(historyId, 'exam', examDataSchema, (record) => patchExam({ type: record.type, source: record.source, bankId: record.bankId ?? '', questionId: record.questionId ?? '', passage: record.passage, pdfPassage: record.source === 'pdf' ? record.passage : '', question: record.question ?? '', optionsText: record.options?.join('\n') ?? '', userAnswer: record.userAnswer ?? '', bankItem: undefined, record }));
  const change = (patch: Partial<ExamDraft>) => { task.clearError(); patchExam({ ...patch, record: undefined }); };
  const question = draft.questionId ? draft.bankItem?.questions.find((item) => item.id === draft.questionId) : draft.bankItem?.questions[0];
  const passage = draft.source === 'bank' ? draft.bankItem?.passage ?? '' : draft.source === 'pdf' ? draft.pdfPassage : draft.passage;
  const options = draft.source === 'bank' ? question?.options ?? [] : draft.optionsText.split('\n').map((text) => text.trim()).filter(Boolean);
  const input = { type: draft.type, source: draft.source, bankId: draft.bankId || undefined, questionId: draft.source === 'bank' ? question?.id : undefined, passage, question: draft.source === 'bank' ? question?.question : draft.question, options, userAnswer: draft.userAnswer || undefined, translate: draft.translate };
  const valid = examAnalyzeRequestSchema.safeParse(input).success && (draft.source !== 'bank' || Boolean(question));
  const busy = task.busy || pdfTask.busy || restoring || !ready;
  async function uploadPdf(file: File) {
    await pdfTask.run(async (signal) => {
      if (file.size > PDF_MAX_BYTES) throw new AppError('FILE_TOO_LARGE');
      if (file.type !== 'application/pdf') throw new AppError('UNSUPPORTED_FILE_TYPE');
      const body = new FormData(); body.set('file', file);
      const { data } = await requestApi('/api/exam/pdf', pdfTextResultSchema, { method: 'POST', body, signal });
      change({ source: 'pdf', pdfPassage: data.text });
      notify('文字已提取，请校对文章并整理题干、选项后开始解析', 'success');
    });
  }
  async function submit(translate = draft.translate) { if (!valid) return; await task.run(async (signal) => { const response = await postApi('/api/exam/analyze', { ...input, translate }, z.union([examResultSchema, textFallbackSchema]), signal); const record: ExamData = { id: uuid(), type: draft.type, source: draft.source, bankId: draft.source === 'bank' ? draft.bankId : undefined, questionId: draft.source === 'bank' ? question?.id : undefined, passage, question: input.question, options, userAnswer: input.userAnswer, sourceLabel: draft.source === 'bank' ? `${draft.bankItem?.year} ${draft.bankItem?.section}` : draft.source === 'pdf' ? 'PDF 文本' : '粘贴文章', createdAt: Date.now(), result: response.data, provider: response.provider }; patchExam({ record }); if (response.provider && response.provider !== 'deepseek') notify('已切换到备用模型'); await persistFeature('exam', record); }); }
  const record = draft.record; const result = record?.result;
  return <><div className="feature-grid"><div className="min-w-0 space-y-4"><div><h2 className="text-xl font-semibold">阅读与题目</h2><p className="mt-1 text-sm text-muted">选择文章和题目，保留你的作答思路。</p></div><Card><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}><SelectField label="考试类型" value={draft.type} disabled={busy} onChange={(event) => change({ type: examTypeSchema.parse(event.target.value), bankId: '', bankItem: undefined, questionId: '', userAnswer: '' })}><option value="english1">英语一（含 2005–2009 旧卷）</option><option value="english2">英语二</option></SelectField><Tabs label="文章来源" value={draft.source} onChange={(value) => change({ source: examSourceSchema.parse(value) })} items={[{ id: 'bank', label: '真题库', disabled: busy }, { id: 'paste', label: '粘贴文章', disabled: busy }, { id: 'pdf', label: '上传 PDF', disabled: busy }]}><div className="pt-5">{draft.source === 'bank' ? <ExamBankPicker key={draft.type} draft={draft} onChange={patchExam} disabled={busy} /> : <div className="space-y-5">{draft.source === 'pdf' && <div className="space-y-3"><label className="block text-sm font-medium">选择 PDF（不超过 20MB）<input type="file" accept="application/pdf,.pdf" disabled={busy} className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-accent-soft file:px-4 file:py-2 file:text-accent" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void uploadPdf(file); }} /></label><p role="status" className="text-xs leading-6 text-muted">{pdfTask.busy ? '正在提取文字…' : '提取后请校对文字，将题干和选项整理到下方；确认后点击开始解析。无法提取时可切换到粘贴文章或真题库。'}</p></div>}<Textarea label="阅读文章" value={passage} onChange={(event) => change(draft.source === 'pdf' ? { pdfPassage: event.target.value } : { passage: event.target.value })} rows={12} disabled={busy} /><Textarea label="题干（可选）" value={draft.question} onChange={(event) => change({ question: event.target.value })} rows={3} disabled={busy} /><Textarea label="选项（可选，每行一项）" value={draft.optionsText} onChange={(event) => change({ optionsText: event.target.value })} rows={4} disabled={busy} /></div>}</div></Tabs>{draft.source === 'bank' && draft.bankItem && <><details><summary className="cursor-pointer text-sm font-medium text-accent">阅读原文 · {draft.bankItem.year} {draft.bankItem.section}</summary><p className="reading mt-3 whitespace-pre-wrap rounded-xl bg-paper p-4 font-serif leading-9">{passage}</p></details><p className="reading font-serif leading-8">{question?.question}</p></>}{options.length ? <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">我的作答（可选）</legend>{options.map((text, index) => { const letter = text.match(/^[\s[(]*([A-D])[)\].\s]/)?.[1] ?? String.fromCharCode(65 + index); return <label key={index} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-7 ${draft.userAnswer === letter ? 'border-accent bg-accent-soft' : 'border-line'}`}><input type="radio" name="exam-answer" value={letter} checked={draft.userAnswer === letter} disabled={busy} className="mt-2 accent-accent" onChange={() => change({ userAnswer: letter })} /><span className="min-w-0 break-words">{text.match(/^[\s[(]*([A-D])[)\].\s]/) ? text : `${letter}. ${text}`}</span></label>; })}<Button variant="ghost" disabled={busy || !draft.userAnswer} onClick={() => change({ userAnswer: '' })}>清除作答</Button></fieldset> : <Input label="我的答案（可选）" value={draft.userAnswer} disabled={busy} onChange={(event) => change({ userAnswer: event.target.value })} />}<label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={draft.translate} disabled={busy} className="h-4 w-4 accent-accent" onChange={(event) => change({ translate: event.target.checked })} />同时生成全文翻译</label><TaskFeedback error={task.error} onRetry={() => { void submit(); }} disabled={!valid || busy} /><TaskFeedback error={pdfTask.error} onRetry={() => { void pdfTask.retry(); }} disabled={busy} /><Button type="submit" loading={task.busy} disabled={!valid || busy}>开始解析</Button></form></Card></div><div className="min-w-0 space-y-5"><div><h2 className="text-xl font-semibold">精读与解析</h2><p className="mt-1 text-sm text-muted">段落精读、答案定位与干扰项分析</p></div><div className="space-y-5" aria-busy={task.busy}>{task.busy ? <AnalysisLoading label="正在精读与定位…" /> : result ? 'text' in result ? <TextFallbackView text={result.text} /> : <><PassageAnalysis value={result.passageAnalysis} /><QuestionAnalysis value={result.questionAnalysis} /><DistractorList items={result.distractorAnalysis} />{result.fullTranslation ? <ResultSection title="全文翻译"><details open={draft.translate}><summary className="cursor-pointer text-sm text-accent">展开 / 收起全文翻译</summary><p className="mt-4 whitespace-pre-wrap">{result.fullTranslation}</p></details></ResultSection> : <Card><p className="mb-3 text-sm text-muted">全文翻译默认不生成，可以按需查看。</p><Button variant="secondary" disabled={busy || !valid} onClick={() => { patchExam({ translate: true }); void submit(true); }}>生成全文翻译</Button></Card>}</> : <Card><h2 className="text-xl font-semibold">{task.busy ? '正在精读与定位…' : '从原文中找到依据'}</h2><p className="mt-3 text-sm leading-7 text-muted">逐段读懂文章，辨别正确答案与干扰项。全文翻译按需生成。</p></Card>}</div><FollowUpInput key={record?.id ?? 'empty'} record={record} disabled={busy} onChange={(updated) => { if (useWorkspace.getState().exam.record?.id === updated.id) patchExam({ record: updated }); }} /></div></div></>;
}
