'use client';
import { createEssayStreamEventSchema } from '@/lib/schemas/essay';
import { AppError } from '@/lib/utils/errors';
import { checkedResponse, ClientFailure } from './api';
import { waitForClientOperation } from './wait';
import type { ApiData, EssayCorrectRequest, EssayReport, EssayStreamEvent, FeatureResult } from '@/types';

export async function consumeEssay(input: EssayCorrectRequest, onEvent: (event: EssayStreamEvent) => void, signal: AbortSignal): Promise<ApiData<FeatureResult<EssayReport>>> {
  const abort = new AbortController();
  const stop = () => abort.abort();
  const timer = setTimeout(stop, 200_000);
  signal.addEventListener('abort', stop, { once: true });
  if (signal.aborted) stop();
  const schema = createEssayStreamEventSchema(input.type, input.composition);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    abort.signal.throwIfAborted();
    const response = await waitForClientOperation(fetch('/api/essay/correct', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(input), signal: abort.signal }), abort.signal);
    if (!response.ok) { await checkedResponse(response); throw new ClientFailure('批改未完成，请重试'); }
    if (!response.headers.get('Content-Type')?.includes('text/event-stream') || !response.body) throw new ClientFailure('未收到有效批改结果，请重试');
    reader = response.body.getReader();
    const decoder = new TextDecoder(); let buffer = ''; let result: ApiData<FeatureResult<EssayReport>> | undefined;
    const frame = (text: string) => {
      const data = text.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
      if (!data) return;
      let raw: unknown; try { raw = JSON.parse(data); } catch { throw new ClientFailure('批改格式异常，预览已保留，请重试'); }
      const event = schema.safeParse(raw);
      if (!event.success) throw new ClientFailure('批改格式异常，预览已保留，请重试');
      if (event.data.type === 'error') throw new AppError(event.data.code);
      onEvent(event.data);
      if (event.data.type === 'done') result = { data: event.data.data, provider: event.data.provider };
    };
    while (!result) {
      const chunk = await waitForClientOperation(reader.read(), abort.signal);
      buffer += decoder.decode(chunk.value, { stream: !chunk.done }); buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0 && !result) { frame(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n'); }
      if (chunk.done) { if (buffer.trim() && !result) frame(buffer); break; }
    }
    abort.signal.throwIfAborted();
    if (!result) throw new ClientFailure('批改中断，预览已保留但未保存分数，请重试');
    return result;
  } catch (error) {
    if (abort.signal.aborted) throw new ClientFailure('批改已停止或超时，输入与预览已保留');
    if (error instanceof AppError || error instanceof ClientFailure) throw error;
    throw new ClientFailure('网络连接失败，输入与预览已保留，请重试');
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', stop);
    if (reader) { void reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
}
