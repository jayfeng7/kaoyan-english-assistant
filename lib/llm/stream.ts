import 'server-only';
import { createProviderClient, classify, ProviderFailure } from './client';
import { getProviders } from './providers';
import { AppError } from '@/lib/utils/errors';
import type { ChatStreamEvent, ChatStreamParams, ProviderConfig, StreamFallbackOptions } from '@/types';

export async function* streamProvider(provider: ProviderConfig, params: ChatStreamParams): AsyncGenerator<string> {
  const timeout = AbortSignal.timeout(60_000);
  const signal = params.signal ? AbortSignal.any([timeout, params.signal]) : timeout;
  try {
    const stream = await createProviderClient(provider).chat.completions.create({ model: provider.model, messages: [{ role: 'system', content: params.system }, ...params.messages], temperature: 0.3, stream: true }, { signal });
    try {
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta.content;
        if (content) yield content;
      }
      if (signal.aborted) throw new ProviderFailure('timeout');
    } finally { stream.controller.abort(); }
  } catch (error) {
    // SDK abort errors do not distinguish our deadline from a user cancellation.
    if (timeout.aborted && !params.signal?.aborted) throw new ProviderFailure('timeout');
    throw error;
  }
}

export async function* streamWithFallback(params: ChatStreamParams, options: StreamFallbackOptions = {}): AsyncGenerator<ChatStreamEvent> {
  const call = options.call ?? streamProvider;
  for (const provider of options.providers ?? getProviders()) {
    let emitted = false; let prefix = '';
    try {
      for await (const content of call(provider, params)) {
        if (params.signal?.aborted) throw new AppError('ALL_PROVIDERS_FAILED');
        if (!emitted) {
          prefix += content;
          if (!prefix.trim()) continue;
          emitted = true; options.onProvider?.(provider.id);
          yield { type: 'delta', content: prefix }; prefix = '';
        } else if (content) { yield { type: 'delta', content }; }
      }
      if (!emitted) throw new ProviderFailure('empty');
      yield { type: 'done', provider: provider.id };
      return;
    } catch (error) {
      // The confirmed SSE contract preserves partial text; a backup cannot append a restarted answer.
      if (emitted || params.signal?.aborted || !classify(error)) throw new AppError('ALL_PROVIDERS_FAILED');
    }
  }
  throw new AppError('ALL_PROVIDERS_FAILED');
}

