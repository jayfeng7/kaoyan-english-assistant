'use client';

import { apiResponseSchema, errorCodeSchema } from '@/lib/schemas/common';
import { chatStreamEventSchema } from '@/lib/schemas/chat';
import { AppError } from '@/lib/utils/errors';
import type { ApiData, ApiUploadOptions, ChatRequest, ChatStreamEvent, Schema } from '@/types';

export class ClientFailure extends Error {}
export function messageFor(error: unknown): string { return error instanceof AppError || error instanceof ClientFailure ? error.message : '操作未完成，请保留内容并重试'; }
export async function checkedResponse(response: Response): Promise<unknown> {
  let raw: unknown;
  try { raw = await response.json() as unknown; } catch {
    // A gateway can return HTML instead of our API envelope. Never display its body.
    if ([408, 504, 524].includes(response.status)) throw new ClientFailure('文件传输或服务器响应超时，内容已保留，请检查网络后重试');
    if (response.status === 413) throw new AppError('FILE_TOO_LARGE');
    if (response.status === 429) throw new AppError('RATE_LIMITED');
    if ([502, 503].includes(response.status)) throw new ClientFailure('服务器暂时无法连接，内容已保留，请稍后重试');
    throw new ClientFailure('服务返回异常，请稍后重试');
  }
  if (!response.ok || (typeof raw === 'object' && raw !== null && 'success' in raw && raw.success === false)) {
    const code = typeof raw === 'object' && raw !== null && 'code' in raw ? errorCodeSchema.safeParse(raw.code) : undefined;
    throw new AppError(code?.success ? code.data : 'INTERNAL_ERROR');
  }
  return raw;
}
async function parseResponse<T>(response: Response, schema: Schema<T>): Promise<ApiData<T>> {
  const parsed = apiResponseSchema(schema).safeParse(await checkedResponse(response));
  if (!parsed.success || !parsed.data.success || parsed.data.data === undefined) throw new ClientFailure('结果格式有误，请重试');
  return { data: parsed.data.data, provider: parsed.data.provider };
}
export async function requestApi<T>(url: string, schema: Schema<T>, init: RequestInit = {}): Promise<ApiData<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 200_000);
  const cancel = () => controller.abort(); init.signal?.addEventListener('abort', cancel, { once: true });
  if (init.signal?.aborted) controller.abort();
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return await parseResponse(response, schema);
  } catch (error) {
    if (error instanceof AppError || error instanceof ClientFailure) throw error;
    throw new ClientFailure(controller.signal.aborted ? '请求已停止或超时，输入内容已保留' : '网络连接失败，请检查连接后重试');
  } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', cancel); }
}
// XHR exposes real upload progress; percentages describe bytes sent, never OCR completion.
function uploadBody<T>(url: string, body: FormData | string, schema: Schema<T>, options: ApiUploadOptions): Promise<ApiData<T>> {
  return new Promise((resolve, reject) => {
    const stopped = () => new ClientFailure('请求已停止或超时，输入内容已保留');
    if (options.signal.aborted) { reject(stopped()); return; }
    const xhr = new XMLHttpRequest();
    const cancel = () => xhr.abort();
    const clean = () => {
      options.signal.removeEventListener('abort', cancel);
      xhr.onload = xhr.onerror = xhr.onabort = xhr.ontimeout = null;
      xhr.upload.onprogress = xhr.upload.onload = null;
    };
    xhr.open('POST', url);
    if (typeof body === 'string') xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 200_000;
    xhr.upload.onprogress = (event) => { if (event.lengthComputable && event.total > 0) options.onProgress(event.loaded, event.total); };
    xhr.upload.onload = () => { if (!options.signal.aborted) options.onUploaded(); };
    xhr.onload = () => {
      clean();
      if (options.signal.aborted) { reject(stopped()); return; }
      if (xhr.status < 200 || xhr.status > 599) { reject(new ClientFailure('服务返回异常，请稍后重试')); return; }
      void parseResponse(new Response(xhr.responseText, { status: xhr.status }), schema).then(resolve, reject);
    };
    xhr.onerror = () => { clean(); reject(new ClientFailure('网络连接失败，请检查连接后重试')); };
    xhr.onabort = xhr.ontimeout = () => { clean(); reject(stopped()); };
    options.signal.addEventListener('abort', cancel, { once: true });
    try { options.signal.throwIfAborted(); xhr.send(body); }
    catch { clean(); reject(options.signal.aborted ? stopped() : new ClientFailure('网络连接失败，请检查连接后重试')); }
  });
}
export function uploadApi<T>(url: string, form: FormData, schema: Schema<T>, options: ApiUploadOptions): Promise<ApiData<T>> {
  return uploadBody(url, form, schema, options);
}
export function uploadJsonApi<T>(url: string, input: unknown, schema: Schema<T>, options: ApiUploadOptions): Promise<ApiData<T>> {
  return uploadBody(url, JSON.stringify(input), schema, options);
}
export function postApi<T>(url: string, input: unknown, schema: Schema<T>, signal?: AbortSignal): Promise<ApiData<T>> {
  return requestApi(url, schema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
}
export async function consumeChat(input: ChatRequest, onEvent: (event: ChatStreamEvent) => void, signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  if (!response.ok) { await checkedResponse(response); return; }
  if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new ClientFailure('未收到有效回答，请重试');
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let terminal = false;
  const frame = (text: string) => {
    const data = text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    let raw: unknown; try { raw = JSON.parse(data); } catch { throw new ClientFailure('回答格式异常，已有文字已保留'); }
    const parsed = chatStreamEventSchema.safeParse(raw);
    if (!parsed.success) throw new ClientFailure('回答格式异常，已有文字已保留');
    onEvent(parsed.data);
    if (parsed.data.type === 'error') throw new AppError(parsed.data.code);
    if (parsed.data.type === 'done') terminal = true;
  };
  try {
    while (!terminal) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done }); buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0 && !terminal) { frame(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n'); }
      if (chunk.done) { if (buffer.trim() && !terminal) frame(buffer); break; }
    }
    if (!terminal) throw new ClientFailure('回答中断，已有文字已保留，请重试');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
