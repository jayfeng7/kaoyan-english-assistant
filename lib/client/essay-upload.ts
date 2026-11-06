'use client';
import { ESSAY_PDF_MAX_BYTES, essayPdfResultSchema } from '@/lib/schemas/essay-bank';
import { ocrResultSchema } from '@/lib/schemas/common';
import { AppError } from '@/lib/utils/errors';
import { imageRequest, type ImageRotation } from './files';
import { ClientFailure, uploadApi, uploadJsonApi } from './api';
import { waitForClientOperation } from './wait';
import type { EssayPdfPage, EssayUploadReview } from '@/types';

export async function prepareEssayUpload(file: File, scan: boolean, signal: AbortSignal, progress: (label: string) => void, selectBody = false, rotation: ImageRotation = 0): Promise<EssayUploadReview> {
  const pages: EssayPdfPage[] = [];
  if (file.type === 'application/pdf') {
    if (file.size > ESSAY_PDF_MAX_BYTES) throw new AppError('FILE_TOO_LARGE');
    if (scan) {
      const controller = new AbortController();
      const stop = () => controller.abort();
      const timer = setTimeout(stop, 200_000);
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
      const bounded = controller.signal;
      progress('正在加载 PDF 处理工具，原文件保留在本机…');
      try {
        const { recognizeBrowserPdf } = await waitForClientOperation(import('./pdf-scan'), bounded);
        bounded.throwIfAborted();
        return await waitForClientOperation(recognizeBrowserPdf(file, bounded, progress, selectBody), bounded);
      } catch (error) {
        if (bounded.aborted) throw new ClientFailure('请求已停止或超时，输入内容已保留');
        if (error instanceof AppError || error instanceof ClientFailure) throw error;
        throw new ClientFailure('PDF 处理工具加载失败，请重试或直接上传该页图片');
      } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
    }
    progress('正在上传 PDF…');
    const form = new FormData(); form.set('file', file); form.set('mode', scan ? 'scan' : 'auto'); form.set('recognize', 'true');
    const { data } = await uploadApi('/api/essay/pdf', form, essayPdfResultSchema, {
      signal,
      onProgress: (loaded, total) => progress(`正在上传 PDF（${Math.min(100, Math.floor(loaded / total * 100))}%）…`),
      onUploaded: () => progress('文件已发出，等待服务器接收并逐页识别…'),
    });
    pages.push(...data.pages);
  } else {
    const abort = new AbortController(); const stop = () => abort.abort(); const timer = setTimeout(stop, 200_000);
    signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
    try {
      progress('正在本机处理图片，减少上传体积…');
      const image = await imageRequest(file, abort.signal, rotation);
      const input = selectBody ? { ...image, selectBody: true } : image;
      const { data } = await uploadJsonApi('/api/ocr', input, ocrResultSchema, {
        signal: abort.signal,
        onProgress: (loaded, total) => progress(`正在上传图片（${Math.min(100, Math.floor(loaded / total * 100))}%）…`),
        onUploaded: () => progress(selectBody ? '正在识别并提取正文…' : '图片已发出，等待服务器接收与识别…'),
      });
      pages.push({ number: 1, method: 'ocr', text: data.text, ocr: data });
      if (selectBody && data.body) { abort.signal.throwIfAborted(); return { pages, confirmed: false, body: data.body }; }
    } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
  }
  signal.throwIfAborted();
  return { pages: essayPdfResultSchema.parse({ pages, total: pages.length }).pages, confirmed: false };
}
