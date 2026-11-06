'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { PencilLine } from 'lucide-react';
import Image from 'next/image';
import { uuid } from '@/lib/utils/uuid';
import { EssayResultView } from './EssayResultView';
import { EssayPrintReport } from './EssayPrintReport';
import { EssayPdfButton } from './EssayPdfButton';
import { EssayEditor } from './EssayEditor';
import { EssayTaskMatcher } from './EssayTaskMatcher';
import { EssayBankPicker } from './EssayBankPicker';
import { EssayUpload } from './EssayUpload';
import { EssayStreamingReport } from './EssayStreamingReport';
import { OcrReview } from './OcrReview';
import { FollowUpInput } from './FollowUpInput';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { EssayReference } from './EssayReference';
import { EssayDetail } from './EssayDetail';
import { SelectField } from '@/components/ui/SelectField';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace, patchEssay } from '@/lib/client/workspace';
import { useTask } from '@/lib/client/task';
import { consumeEssay } from '@/lib/client/essay-stream';
import { persistFeature, useRestoreHistory } from '@/lib/client/history';
import { compositionTypeSchema, examTypeSchema } from '@/lib/schemas/common';
import { essaySourceSchema } from '@/lib/schemas/essay-bank';
import { essayDataSchema } from '@/lib/schemas/storage';
import { essaySubmissionInput, checkEssaySubmission, essayBankSelectionPatch } from '@/lib/client/essay-input';
import { essayReviewReason } from '@/lib/utils/essay-safety';
import { essayPreviewFeedback } from '@/lib/utils/essay-feedback';
import { getHistory } from '@/lib/storage/history';
import type { EssayBankItem, EssayData, EssayDraft, EssayReport, EssayStreamPreview, FeatureResult, HistoryFormProps, ProviderId } from '@/types';

export function EssayForm({ historyId }: HistoryFormProps) {
  const draft = useWorkspace((state) => state.essay); const ready = useWorkspace((state) => state.ready); const task = useTask(); const { notify } = useToast();
  const [matcherBusy, setMatcherBusy] = useState(false);
  const [promptBusy, setPromptBusy] = useState(false); const [essayBusy, setEssayBusy] = useState(false); const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<EssayStreamPreview>(); const [startedAt, setStartedAt] = useState(0); const [stopped, setStopped] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLDivElement>(null); const [focusChat, setFocusChat] = useState(0); const focusedChat = useRef(0);
  useEffect(() => {
    if (focusChat === focusedChat.current || preview || editing || !draft.record?.result) return;
    focusedChat.current = focusChat;
    followUpRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    followUpRef.current?.querySelector('textarea')?.focus({ preventScroll: true });
  }, [focusChat, preview, editing, draft.record]);
  useEffect(() => { if (startedAt) reportRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' }); }, [startedAt]);
  const restoring = useRestoreHistory(historyId, 'essay', essayDataSchema, (record) => { setEditing(false); setPreview(undefined); task.clearError(); patchEssay({ type: record.type, composition: record.composition, source: 'custom', bankItem: undefined, bankId: undefined, year: undefined, prompt: record.prompt, customPrompt: record.prompt, essay: record.essay, record, ocrResult: record.ocrResult, ocrText: record.essay, ocrConfirmed: true, promptReview: undefined, essayReview: undefined }); });
  const busy = task.busy || matcherBusy || promptBusy || essayBusy || !ready || restoring;
  const source = draft.source ?? 'custom';
  const submission = essaySubmissionInput(draft);
  const { prompt, essay: body } = submission;
  const valid = checkEssaySubmission(draft).success;
  const wordCount = body.trim().split(/\s+/u).filter(Boolean).length;
  const hintId = useId();
  const inputHint = valid ? undefined : source === 'bank' && !draft.bankItem ? '请选择年份。' : !prompt.trim() ? '请填写题目。' : !body.trim() ? '请填写正文。' : essayReviewReason(submission) ?? '请检查题目和正文的长度，以及所选题型。';
  const change = (patch: Partial<EssayDraft>) => { task.clearError(); setPreview(undefined); patchEssay({ ...patch, record: undefined }); };
  const clearBank = () => change({ bankId: undefined, bankItem: undefined, year: undefined, prompt: '' });
  function selectBank(item: EssayBankItem) {
    change(essayBankSelectionPatch(draft, item));
  }
  function makeRecord(result: FeatureResult<EssayReport>, provider?: ProviderId): EssayData {
    const item = source === 'bank' ? draft.bankItem : undefined;
    return { id: uuid(), type: draft.type, composition: draft.composition, title: item?.title ?? prompt.slice(0, 32), prompt, essay: body, wordCount, createdAt: Date.now(), ocrResult: draft.essayReview?.pages.length === 1 ? draft.essayReview.pages[0]?.ocr : draft.essayReview ? undefined : draft.ocrResult, source, bankId: item?.id, year: item?.year, sourceLabel: item?.title, result, provider };
  }
  async function saveFollowUps(updated: EssayData) {
    const current = useWorkspace.getState().essay.record;
    const parsed = current?.id === updated.id ? undefined : essayDataSchema.safeParse((await getHistory(updated.id))?.data);
    const saved = current?.id === updated.id ? current : parsed?.success ? parsed.data : undefined;
    await persistFeature('essay', { ...(saved ?? updated), followUps: updated.followUps });
  }
  async function discussPreview() {
    if (busy || !preview) return;
    const record = makeRecord(essayPreviewFeedback(preview));
    patchEssay({ record }); setPreview(undefined); task.clearError(); setFocusChat(value => value + 1);
    try { await persistFeature('essay', record); } catch { notify('对话可以继续，历史保存失败，请先导出备份', 'error'); }
  }
  async function submit() {
    if (busy) return;
    const parsed = checkEssaySubmission(draft); if (!parsed.success) return;
    await task.run(async (signal) => {
      setStartedAt(Date.now()); setStopped(false); setEditing(false);
      setPreview({ overallComment: '', sentenceAnnotations: [], improvedEssay: '', modelEssay: '' });
      const response = await consumeEssay({ ...parsed.data, report: 'core' }, (event) => {
        if (signal.aborted) return;
        if (event.type === 'preview') setPreview(current => current ? { ...current, [event.field]: current[event.field] + event.text } : current);
        if (event.type === 'annotation') setPreview(current => current ? { ...current, sentenceAnnotations: [...current.sentenceAnnotations, event.annotation] } : current);
        if (event.type === 'score') setPreview(current => current ? { ...current, scoreCard: event.scoreCard } : current);
      }, signal);
      signal.throwIfAborted();
      const record = makeRecord(response.data, response.provider);
      patchEssay({ record }); setPreview(undefined); if (response.provider && response.provider !== 'deepseek') notify('已切换到备用模型');
      await persistFeature('essay', record);
    });
  }
  const record = draft.record; const result = record?.result;
  const showReport = !editing && Boolean(preview || result);
  return <><div data-print-hidden className="essay-flow">
    <div className="min-w-0 space-y-5">
      {!showReport && <header><h1 className="text-2xl font-semibold sm:text-3xl">作文批改</h1></header>}
      {!showReport && <Card><form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Tabs label="作文题目来源" value={source} items={[{ id: 'bank', label: '历年真题', disabled: busy }, { id: 'custom', label: '其他题目', disabled: busy }]} onChange={(value) => { const next = essaySourceSchema.parse(value); if (next === source) return; change(next === 'bank' ? { source: next, customPrompt: draft.prompt, prompt: '', bankId: undefined, bankItem: undefined, year: undefined } : { source: next, prompt: draft.customPrompt ?? '', bankId: undefined, bankItem: undefined, year: undefined }); }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="考试类型" value={draft.type} disabled={busy} onChange={(event) => change({ type: examTypeSchema.parse(event.target.value), ...(source === 'bank' ? { bankId: undefined, bankItem: undefined, year: undefined, prompt: '' } : {}) })}><option value="english1">英语一</option><option value="english2">英语二</option></SelectField>
          <SelectField label="作文类型" value={draft.composition} disabled={busy} onChange={(event) => change({ composition: compositionTypeSchema.parse(event.target.value), ...(source === 'bank' ? { bankId: undefined, bankItem: undefined, year: undefined, prompt: '' } : {}) })}><option value="big">大作文</option><option value="small">小作文</option></SelectField>
        </div>
        <p className="text-sm font-medium text-accent">{draft.type === 'english1' ? '英语一' : '英语二'} · {draft.composition === 'small' ? '小作文 · 满分 10 分 · 关注格式、语域和要点' : draft.type === 'english1' ? '大作文 · 满分 20 分' : '大作文 · 满分 15 分'}</p>
        {source === 'bank' ? <><EssayBankPicker key={`${draft.type}:${draft.composition}`} draft={draft} onSelect={selectBank} onClear={clearBank} disabled={busy} />{draft.bankItem && <EssayDetail title={draft.bankItem.title} description="题目已载入 · 展开查看材料与写作要求"><div className="space-y-4"><p className="whitespace-pre-wrap text-sm leading-7">{draft.bankItem.directions}</p>{draft.bankItem.materialImage && <Image src={draft.bankItem.materialImage} alt={`${draft.bankItem.title}题目材料`} width={1000} height={1000} unoptimized className="mx-auto h-auto w-full max-w-lg rounded-lg" />}<p className="whitespace-pre-wrap text-sm leading-7">{draft.bankItem.materialDescription}</p></div></EssayDetail>}</> : <>
          {!draft.promptReview && <Textarea label="作文题目与要求" value={draft.prompt} onChange={(event) => change({ prompt: event.target.value, customPrompt: event.target.value })} rows={4} characterLimit={500} disabled={busy} placeholder="填写题目；图画或图表请补充画面、数据及写作要求。" />}
          <EssayDetail title="上传题目图片 / PDF" description={draft.promptReview ? '已使用识别文字，可展开编辑' : '已有文字题目可跳过'}><EssayUpload label="题目" review={draft.promptReview} disabled={busy} characterLimit={500} onBusyChange={setPromptBusy} onChange={(promptReview) => change({ promptReview })} /></EssayDetail>
        </>}
        {!draft.essayReview && !draft.ocrResult && <EssayEditor label="作文正文" value={draft.essay} onTextChange={essay => change({ essay })} disabled={busy} />}
        <EssayUpload label="正文" review={draft.essayReview} disabled={busy} characterLimit={8000} onBusyChange={setEssayBusy} onChange={(essayReview) => change({ essayReview })} />
        {draft.ocrResult && !draft.essayReview && <><OcrReview result={draft.ocrResult} text={draft.ocrText} onChange={(ocrText) => change({ ocrText, ocrConfirmed: false })} onConfirm={() => {}} busy={busy} valid={valid && !busy} confirmed={draft.ocrConfirmed} automatic /><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={draft.ocrConfirmed && draft.ocrPageCompleteness === 'full'} disabled={busy} onChange={event => change({ ocrConfirmed: event.target.checked, ocrPageCompleteness: event.target.checked ? 'full' : 'unknown' })} /><span>已对照原图校对学生原文、移除教师批注，并确认包含整篇作文及续页</span></label><Button variant="secondary" disabled={busy} onClick={() => change({ ocrResult: undefined })}>返回手动正文草稿</Button></>}
        {!draft.bankItem && <EssayTaskMatcher essay={body} prompt={prompt} inputEvidence={submission.inputEvidence} disabled={busy} onBusyChange={setMatcherBusy} onSelect={selectBank} />}
        <TaskFeedback error={task.error} onRetry={() => { void submit(); }} disabled={busy || !valid} />
        <div className="space-y-3 border-t border-line pt-4"><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p className="tabular-nums text-muted">当前正文 {wordCount} 词</p>{inputHint && <p id={hintId} className="text-muted">{inputHint}</p>}</div><div className="flex flex-wrap items-center gap-3"><Button className="w-full sm:w-auto" type="submit" loading={task.busy} disabled={!valid || busy} aria-describedby={inputHint ? hintId : undefined}>批改</Button>{(result || preview) && <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>返回报告</Button>}</div></div>
        
      </form></Card>}
      {showReport && <div ref={reportRef} className="min-w-0 scroll-mt-20 space-y-4"><header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h1 className="text-2xl font-semibold sm:text-3xl">批改结果</h1><p className="mt-1 text-xs leading-6 text-muted sm:text-sm">{record && !preview ? `${record.type === 'english1' ? '英语一' : '英语二'} · ${record.composition === 'small' ? '小作文' : '大作文'} · ${record.wordCount} 词` : `${draft.type === 'english1' ? '英语一' : '英语二'} · ${draft.composition === 'small' ? '小作文 · 满分 10 分' : draft.type === 'english1' ? '大作文 · 满分 20 分' : '大作文 · 满分 15 分'}`}</p>{record?.sourceLabel && !preview && <p className="mt-1 text-xs leading-5 text-muted">{record.sourceLabel}</p>}</div><div className="flex shrink-0 justify-end gap-1"><Button variant="ghost" className="px-3" aria-label="编辑作文" title="编辑作文" disabled={busy} onClick={() => setEditing(true)}><PencilLine aria-hidden="true" className="h-4 w-4" /><span className="hidden sm:inline">编辑</span></Button>{record && result && !preview && <EssayPdfButton record={record} disabled={busy} />}</div></header><div className="space-y-4" aria-busy={task.busy}>{preview ? <EssayStreamingReport max={draft.composition === 'small' ? 10 : draft.type === 'english1' ? 20 : 15} key={startedAt} preview={preview} busy={task.busy} stopped={stopped} startedAt={startedAt} error={task.error} onStop={() => { setStopped(true); task.cancel(); }} /> : record && <EssayResultView record={record} part="summary" />}</div>
        {preview && !task.busy && <div className="flex flex-wrap gap-3"><Button disabled={!valid || busy} onClick={() => { void submit(); }}>重新批改</Button><Button variant="secondary" onClick={() => { void discussPreview(); }}>继续提问</Button></div>}
        {result && 'text' in result && !preview && <Button disabled={!valid || busy} onClick={() => { void submit(); }}>重新批改</Button>}
        {record && !preview && <><div ref={followUpRef} className="scroll-mt-20"><FollowUpInput key={record.id} record={record} disabled={busy} onSettled={saveFollowUps} onChange={(updated) => { const current = useWorkspace.getState().essay.record; if (current?.id === updated.id) patchEssay({ record: { ...current, followUps: updated.followUps } }); }} /></div><EssayReference key={record.id} record={record} onChange={async updated => { const current = useWorkspace.getState().essay.record; if (current?.id !== updated.id) return; const merged = { ...current, result: updated.result }; patchEssay({ record: merged }); try { await persistFeature('essay', merged); } catch { notify('参考已生成，历史保存失败，请先导出备份', 'error'); } }} /><p className="text-xs text-muted">分数供练习参考。</p></>}
      </div>}
    </div>
  </div>{record?.result && !preview && <EssayPrintReport record={record} />}</>;
}
