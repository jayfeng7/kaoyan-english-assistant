'use client';
import { essayBodySelectionSchema } from '@/lib/schemas/essay-body';
import { postApi } from './api';
import type { ImageRotation } from './files';
import { prepareEssayUpload } from './essay-upload';
import { waitForClientOperation } from './wait';
import { ClientFailure } from './api';
import type { EssayUploadReview, PdfUploadProgress } from '@/types';
import { reflowEssay } from '@/lib/utils/essay-layout';

export async function prepareEssayBody(review: EssayUploadReview, signal: AbortSignal): Promise<EssayUploadReview> {
  signal.throwIfAborted();
  if (review.body) return review;
  const text = review.pages.map(page => page.text).join('\n\n');
  try {
    const { data } = await postApi('/api/essay/body', { text }, essayBodySelectionSchema, signal);
    signal.throwIfAborted();
    return { ...review, body: data };
  } catch {
    signal.throwIfAborted();
    // A failed selector must never silently submit the entire paper for scoring.
    return { ...review, body: { text: '', status: 'review', excludedLines: 0 } };
  }
}

export async function prepareEssayFile(file: File, scan: boolean, signal: AbortSignal, progress: PdfUploadProgress, rotation: ImageRotation = 0): Promise<EssayUploadReview> {
  const bounded = new AbortController(); const stop = () => bounded.abort();
  const timer = setTimeout(stop, 200_000);
  signal.addEventListener('abort', stop, { once: true }); if (signal.aborted) stop();
  try {
    bounded.signal.throwIfAborted();
    const review = await waitForClientOperation(prepareEssayUpload(file, scan, bounded.signal, progress, true, rotation), bounded.signal);
    progress('提取作文正文…');
    const selected = await waitForClientOperation(prepareEssayBody(review, bounded.signal), bounded.signal);
    return selected.body?.status === 'ready' ? { ...selected, confirmed: false, body: { ...selected.body, text: reflowEssay(selected.body.text) } } : selected;
  } catch (error) {
    if (bounded.signal.aborted) throw new ClientFailure('识别已停止，原文已保留');
    throw error;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
}
