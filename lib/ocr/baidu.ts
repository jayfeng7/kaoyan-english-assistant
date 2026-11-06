import 'server-only';
import { baiduOcrSchema, baiduTokenSchema } from '@/lib/schemas/api';
import { ocrResultSchema } from '@/lib/schemas/common';
import { AppError } from '@/lib/utils/errors';
import { waitForOcrSlot } from './schedule';
import type { CachedOcrToken, LowConfidenceWord, OcrResult } from '@/types';

let cachedToken: CachedOcrToken | undefined;
let pendingToken: Promise<string> | undefined;

async function postForm(url: string, body: URLSearchParams, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body, cache: 'no-store', signal: signal ? AbortSignal.any([timeout, signal]) : timeout });
  if (!response.ok) throw new AppError('OCR_FAILED');
  return await response.json() as unknown;
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.refreshAt) return cachedToken.value;
  pendingToken ??= (async () => {
    try {
      const apiKey = process.env.BAIDU_OCR_API_KEY?.trim(); const secretKey = process.env.BAIDU_OCR_SECRET_KEY?.trim();
      if (!apiKey || !secretKey) throw new AppError('OCR_FAILED');
      const raw = await postForm('https://aip.baidubce.com/oauth/2.0/token', new URLSearchParams({ grant_type: 'client_credentials', client_id: apiKey, client_secret: secretKey }));
      const token = baiduTokenSchema.parse(raw);
      cachedToken = { value: token.access_token, refreshAt: Date.now() + Math.max(0, token.expires_in * 1000 - 3_600_000) };
      return token.access_token;
    } catch { throw new AppError('OCR_FAILED'); }
  })();
  try { return await pendingToken; } finally { pendingToken = undefined; }
}

export function normalizeOcr(raw: unknown): OcrResult {
  const parsed = baiduOcrSchema.safeParse(raw);
  if (!parsed.success || parsed.data.words_result.length === 0) throw new AppError('OCR_FAILED');
  const lowConfidenceWords: LowConfidenceWord[] = [];
  let text = ''; let total = 0;
  for (const line of parsed.data.words_result) {
    if (text) text += '\n';
    const start = text.length; text += line.words; total += line.probability.average;
    if (line.words && line.probability.average < 0.6) lowConfidenceWords.push({ word: line.words, confidence: line.probability.average, start, end: text.length });
  }
  if (!text.trim()) throw new AppError('OCR_FAILED');
  return ocrResultSchema.parse({ text, confidence: total / parsed.data.words_result.length, lowConfidenceWords });
}

// Cancelling one upload must not cancel a shared token refresh for other users.
async function waitForToken(signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const pending = getAccessToken();
  if (!signal) return pending;
  return new Promise((resolve, reject) => {
    const cancel = () => { signal.removeEventListener('abort', cancel); reject(new AppError('OCR_FAILED')); };
    signal.addEventListener('abort', cancel, { once: true });
    pending.then((value) => { signal.removeEventListener('abort', cancel); resolve(value); }, () => { signal.removeEventListener('abort', cancel); reject(new AppError('OCR_FAILED')); });
    if (signal.aborted) cancel();
  });
}

export async function recognizeHandwriting(base64Image: string, signal?: AbortSignal): Promise<OcrResult> {
  try {
    const token = await waitForToken(signal);
    await waitForOcrSlot(signal);
    signal?.throwIfAborted();
    const raw = await postForm(`https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting?access_token=${encodeURIComponent(token)}`, new URLSearchParams({ image: base64Image, language_type: 'CHN_ENG', probability: 'true' }), signal);
    return normalizeOcr(raw);
  } catch { throw new AppError('OCR_FAILED'); }
}

