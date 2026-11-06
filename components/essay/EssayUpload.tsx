'use client';
import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { SelectField } from '@/components/ui/SelectField';
import { ImageOrientationPicker } from './ImageOrientationPicker';
import type { ImageRotation } from '@/lib/client/files';
import { OcrReview } from './OcrReview';
import { EssayEditor } from './EssayEditor';
import { useTask } from '@/lib/client/task';
import { reviewedText } from '@/lib/client/essay-input';
import { prepareEssayUpload } from '@/lib/client/essay-upload';
import { prepareEssayFile } from '@/lib/client/essay-body';
import type { AnalysisLoadingProps, EssayUploadProps } from '@/types';

function UploadStatus({ label }: AnalysisLoadingProps) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const startedAt = Date.now(); const timer = setInterval(() => setSeconds(Math.floor(Math.max(0, Date.now() - startedAt) / 1000)), 1000); return () => clearInterval(timer); }, []);
  return <p role="status" className="text-sm text-muted">{label}<span aria-live="off" className="ml-2">{seconds}秒</span></p>;
}

export function EssayUpload({ label, review, disabled, characterLimit, onBusyChange, onChange }: EssayUploadProps) {
  const task = useTask(); const [scan, setScan] = useState(true); const [progress, setProgress] = useState('');
  useEffect(() => { onBusyChange(task.busy); return () => onBusyChange(false); }, [task.busy, onBusyChange]);
  const [pendingImage, setPendingImage] = useState<File>();
  async function upload(file: File, rotation: ImageRotation = 0) {
    await task.run(async signal => {
      const uploaded = label === '正文' ? await prepareEssayFile(file, scan, signal, setProgress, rotation) : await prepareEssayUpload(file, scan, signal, setProgress, false, rotation);
      if (!signal.aborted) onChange(uploaded);
    });
  }
  const totalText = reviewedText(review, '');
  const valid = Boolean(totalText.trim()) && totalText.length <= characterLimit;
  const uncertain = review?.pages.reduce((count, page) => count + (page.ocr?.lowConfidenceWords.length ?? 0), 0) ?? 0;
  const lowConfidence = review?.pages.some(page => page.ocr && page.ocr.confidence < 0.6) ?? false;
  const rawText = review?.pages.map(page => page.text).join('\n\n') ?? '';
  const body = label === '正文' ? review?.body : undefined;
  const unclearBody = body ? review?.pages.flatMap(page => page.ocr?.lowConfidenceWords ?? []).filter(word => body.text.includes(word.word)) ?? [] : [];
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className={`relative inline-flex min-h-10 items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-accent ${disabled || task.busy ? 'opacity-50' : 'hover:border-accent/40 hover:bg-accent-soft'}`}>
        <Upload aria-hidden="true" className="h-4 w-4" />{review ? '更换文件' : '上传图片 / PDF'}
        <input type="file" aria-label={`选择${label}图片或 PDF`} accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" disabled={disabled || task.busy} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { if (file.type.startsWith('image/')) setPendingImage(file); else { setPendingImage(undefined); void upload(file); } } }} />
      </label>
      {!review && <span className="text-xs text-muted">图片10MB · PDF20MB，最多5页</span>}
    </div>
    {!review && <details className="text-xs text-muted"><summary className="cursor-pointer">PDF选项</summary><div className="mt-3"><SelectField label={`${label} PDF 内容`} value={scan ? 'scan' : 'auto'} disabled={disabled || task.busy} onChange={event => setScan(event.target.value === 'scan')}><option value="scan">手写或扫描件</option><option value="auto">纯文字PDF</option></SelectField></div></details>}
    {pendingImage && <ImageOrientationPicker key={`${pendingImage.name}-${pendingImage.lastModified}`} file={pendingImage} disabled={disabled || task.busy} onCancel={() => setPendingImage(undefined)} onConfirm={rotation => { const file = pendingImage; setPendingImage(undefined); void upload(file, rotation); }} />}
    {task.error && <div role="alert" className="flex items-center gap-3 text-sm text-red-700"><p>{task.error}</p><Button variant="ghost" disabled={disabled || task.busy} onClick={() => { void task.retry(); }}>重试</Button></div>}
    {task.busy && <><UploadStatus label={progress} /><Button variant="ghost" onClick={task.cancel}>停止识别</Button></>}
    {review && body ? <div className="space-y-3">
      <p role="status" className="text-xs text-muted">{body.status === 'review' ? '未能明确区分正文，请从下方原始文字中选出作文。' : `正文 ${body.text.trim().split(/\s+/u).filter(Boolean).length} 词${body.excludedLines ? `，已排除 ${body.excludedLines} 行其他内容` : ''}`}</p>
      <EssayEditor label="作文正文" value={body.text} disabled={disabled || task.busy} characterLimit={characterLimit} onTextChange={text => onChange({ ...review, confirmed: false, body: { ...body, text, status: 'ready' } })} />
      {unclearBody.length > 0 && <p className="text-xs leading-6 text-amber-900">请核对字迹：{unclearBody.slice(0, 3).map((word, index) => <mark key={index} className="mx-1 rounded bg-amber-100 px-1">{word.word}</mark>)}</p>}
      <details open={body.status === 'review' ? true : undefined} className="text-sm"><summary className="cursor-pointer py-1 text-muted">原始识别文字</summary><div className="mt-3 space-y-2"><p className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-paper p-3 text-sm leading-7">{rawText}</p><div className="flex gap-2"><Button variant="ghost" disabled={disabled || task.busy} onClick={() => onChange({ ...review, confirmed: false, body: { text: rawText, status: 'ready', excludedLines: 0 } })}>保留全部文字</Button><Button variant="ghost" disabled={disabled || task.busy} onClick={() => onChange(undefined)}>移除文件</Button></div></div></details>
      {!valid && body.status !== 'review' && <p role="alert" className="text-sm text-red-700">正文为空或超过{characterLimit}字符。</p>}
    </div> : review && <div className="space-y-3 rounded-xl border border-line bg-paper/60 p-4">
      <p role="status" className="text-sm text-muted">已识别 {review.pages.length} 页</p>
      {(uncertain > 0 || lowConfidence) && <p className="text-sm text-amber-900">{uncertain > 0 ? `${uncertain} 处识别存疑` : '识别置信度较低'}，可展开文字检查。</p>}
      <details><summary className="cursor-pointer text-sm text-accent">查看或编辑识别文字</summary><div className="mt-4 space-y-5">{review.pages.map((page, index) => {
        const update = (text: string) => onChange({ pages: review.pages.map((entry, position) => position === index ? { ...entry, text } : entry), confirmed: false });
        const pageLabel = `${label}第 ${page.number} 页识别文字`;
        return page.ocr ? <OcrReview key={page.number} result={page.ocr} text={page.text} onChange={update} onConfirm={() => {}} busy={disabled || task.busy} valid={valid} confirmed={false} heading={`${label}第 ${page.number} 页`} textLabel={pageLabel} characterLimit={characterLimit} automatic /> : <Textarea key={page.number} label={pageLabel} value={page.text} onChange={event => update(event.target.value)} rows={6} disabled={disabled || task.busy} characterLimit={characterLimit} />;
      })}</div></details>
      {!valid && <p role="alert" className="text-sm text-red-700">识别内容为空或超过 {characterLimit} 字符，请编辑后再批改。</p>}
      <button type="button" className="text-xs text-muted underline underline-offset-4" disabled={disabled || task.busy} onClick={() => onChange(undefined)}>改用手动输入</button>
      {label === '题目' && <p className="text-xs leading-6 text-muted">图画或图表题请补充画面、数据和写作要求。</p>}
    </div>}
    {label === '正文' && review && review.pages.some(page => page.ocr) && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>识别可能把红笔批注、划去内容和正文混在一起。请先对照原图校对；无法辨认的片段保留 [?]，暂不评分。</p>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={review.confirmed && review.pageCompleteness === 'full'} disabled={disabled || task.busy || !valid || body?.status === 'review'} onChange={event => onChange({ ...review, confirmed: event.target.checked, pageCompleteness: event.target.checked ? 'full' : 'unknown' })} /><span>已核对学生原文、移除题面和教师批注，并确认包含开头、结尾及全部续页</span></label>
      {!review.confirmed && <p className="text-xs">若只有残页或图片被裁切，请先补齐；当前不能判断完整字数和结构。</p>}
    </div>}
  </div>;
}
