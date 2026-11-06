'use client';
import { PDFParse } from 'pdf-parse';
import { ESSAY_PDF_MAX_BYTES, ESSAY_PDF_MAX_PAGES, essayPdfResultSchema } from '@/lib/schemas/essay-bank';
import { ocrResultSchema } from '@/lib/schemas/common';
import { AppError } from '@/lib/utils/errors';
import { ClientFailure, uploadJsonApi } from './api';
import { waitForClientOperation } from './wait';
import type { EssayPdfPage, EssayUploadReview, PdfUploadProgress } from '@/types';

// Loaded only after selecting a scan. The matching worker is served by our own origin.
PDFParse.setWorker('/pdf-worker/2.4.5/pdf.worker.mjs');

export async function encodePdfPage(dataUrl: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  if (!dataUrl.startsWith('data:image/png;base64,')) throw new AppError('PDF_PARSE_FAILED');
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    await new Promise<void>((resolve, reject) => {
      const clean = () => { image.onload = image.onerror = null; signal.removeEventListener('abort', cancel); };
      const cancel = () => { clean(); image.src = ''; reject(new ClientFailure('请求已停止或超时，输入内容已保留')); };
      image.onload = () => { clean(); resolve(); };
      image.onerror = () => { clean(); reject(new AppError('PDF_PARSE_FAILED')); };
      signal.addEventListener('abort', cancel, { once: true });
      image.src = dataUrl;
      if (signal.aborted) cancel();
    });
    signal.throwIfAborted();
    if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new AppError('PDF_PARSE_FAILED');
    const scale = Math.min(1, 2000 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new ClientFailure('当前浏览器无法处理 PDF 页面，请尝试更新浏览器或直接上传该页图片');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', 0.8);
    if (!jpeg.startsWith('data:image/jpeg;base64,')) throw new AppError('PDF_PARSE_FAILED');
    return jpeg.slice(jpeg.indexOf(',') + 1);
  } finally { image.onload = image.onerror = null; image.src = ''; canvas.width = canvas.height = 0; }
}

export async function recognizeBrowserPdf(file: File, signal: AbortSignal, progress: PdfUploadProgress, selectBody = false): Promise<EssayUploadReview> {
  signal.throwIfAborted();
  if (file.size > ESSAY_PDF_MAX_BYTES) throw new AppError('FILE_TOO_LARGE');
  const data = new Uint8Array(await waitForClientOperation(file.arrayBuffer(), signal));
  signal.throwIfAborted();
  if (new TextDecoder().decode(data.subarray(0, 5)) !== '%PDF-') throw new AppError('PDF_PARSE_FAILED');
  const parser = new PDFParse({ data, verbosity: 0, isEvalSupported: false });
  const pages: EssayPdfPage[] = [];
  let pendingParse: Promise<unknown> | undefined;
  async function parseStep<T>(operation: Promise<T>): Promise<T> {
    pendingParse = operation;
    const value = await waitForClientOperation(operation, signal);
    pendingParse = undefined;
    return value;
  }
  try {
    progress('正在本机检查 PDF 页数…');
    const info = await parseStep(parser.getInfo({ parsePageInfo: true }));
    signal.throwIfAborted();
    if (!Number.isInteger(info.total) || info.total < 1 || info.total > ESSAY_PDF_MAX_PAGES) throw new AppError('INVALID_INPUT');
    // 流水线：渲染完一页即进入识别队列，渲染下一页与上传识别上一页并行；
    // 识别链保持串行与页序，任一页识别失败后停止渲染并不再发起后续识别。
    let ocrFailure: unknown;
    let ocrChain: Promise<void> = Promise.resolve();
    for (let number = 1; number <= info.total; number++) {
      signal.throwIfAborted();
      if (ocrFailure) throw ocrFailure;
      progress(`正在本机处理第 ${number}/${info.total} 页…`);
      const bounds = info.pages.find(page => page.pageNumber === number);
      if (!bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height) || bounds.width <= 0 || bounds.height <= 0) throw new AppError('PDF_PARSE_FAILED');
      const rendered = await parseStep(parser.getScreenshot({ partial: [number], scale: Math.min(2, 2000 / Math.max(bounds.width, bounds.height)), imageBuffer: false, imageDataUrl: true }));
      signal.throwIfAborted();
      const page = rendered.pages[0];
      if (!page || page.pageNumber !== number) throw new AppError('PDF_PARSE_FAILED');
      const image = await encodePdfPage(page.dataUrl, signal);
      signal.throwIfAborted();
      ocrChain = ocrChain.then(async () => {
        if (ocrFailure || signal.aborted) return;
        progress(`正在上传第 ${number}/${info.total} 页…`);
        const { data: ocr } = await uploadJsonApi('/api/ocr', { image, mime: 'image/jpeg', ...(selectBody && info.total === 1 ? { selectBody: true } : {}) }, ocrResultSchema, {
          signal,
          onProgress: (loaded, total) => progress(`正在上传第 ${number}/${info.total} 页（${Math.min(100, Math.floor(loaded / total * 100))}%）…`),
          onUploaded: () => progress(`第 ${number}/${info.total} 页已发出，等待接收与识别…`),
        });
        pages.push({ number, method: 'ocr', text: ocr.text, ocr });
      }).catch((error: unknown) => { if (!ocrFailure) ocrFailure = error; });
    }
    await ocrChain;
    if (ocrFailure) throw ocrFailure;
    signal.throwIfAborted();
    const checked = essayPdfResultSchema.safeParse({ total: info.total, pages });
    if (!checked.success) throw new AppError('PDF_PARSE_FAILED');
    return { pages: checked.data.pages, confirmed: false, ...(selectBody && info.total === 1 && checked.data.pages[0]?.ocr?.body ? { body: checked.data.pages[0].ocr.body } : {}) };
  } catch (error) {
    if (signal.aborted) throw new ClientFailure('请求已停止或超时，输入内容已保留');
    if (error instanceof AppError || error instanceof ClientFailure) throw error;
    throw new AppError('PDF_PARSE_FAILED');
  } finally {
    if (signal.aborted && pendingParse) {
      // A native rendering/loading step may finish later. Release its document then,
      // without holding the upload UI or ever continuing to OCR after cancellation.
      void pendingParse.then(() => parser.destroy(), () => parser.destroy()).catch(() => undefined);
    } else await waitForClientOperation(parser.destroy().catch(() => undefined), signal);
  }
}
