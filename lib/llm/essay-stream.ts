import 'server-only';
import { buildProviderRequest, createProviderClient, classify, ProviderFailure } from './client';
import { getProviders } from './providers';
import { EssayPreviewReader } from './essay-preview';
import { repairEssayJson } from './essay-format';
import { essayPreviewFeedback } from '@/lib/utils/essay-feedback';
import { AppError } from '@/lib/utils/errors';
import type { ApiContext, EssayReport, EssayStreamEvent, EssayStreamPreview, LlmParams, ProviderConfig, Schema, StructuredStreamOptions } from '@/types';

export async function* streamStructuredProvider(provider: ProviderConfig, params: LlmParams): AsyncGenerator<string> {
  const timeout = AbortSignal.timeout(60_000);
  const signal = params.signal ? AbortSignal.any([timeout, params.signal]) : timeout;
  signal.throwIfAborted();
  try {
    const stream = await createProviderClient(provider).chat.completions.create({ ...buildProviderRequest(provider, { ...params, json: true }), stream: true }, { signal });
    try {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta.content;
        if (text) yield text;
      }
      if (signal.aborted) throw new ProviderFailure('timeout');
    } finally { stream.controller.abort(); }
  } catch (error) {
    if (timeout.aborted && !params.signal?.aborted) throw new ProviderFailure('timeout');
    throw error;
  }
}

export async function* streamEssay(params: LlmParams, schema: Schema<EssayReport>, context: ApiContext, options: StructuredStreamOptions = {}): AsyncGenerator<EssayStreamEvent> {
  const call = options.call ?? streamStructuredProvider;
  yield { type: 'status', stage: 'generating' };
  for (const provider of options.providers ?? getProviders()) {
    let content = ''; let emitted = false;
    const preview = new EssayPreviewReader(options.scoreSchema);
    const feedback: EssayStreamPreview = { overallComment: '', sentenceAnnotations: [], improvedEssay: '', modelEssay: '' };
    try {
      params.signal?.throwIfAborted();
      context.provider = provider.id;
      for await (const text of call(provider, params)) {
        params.signal?.throwIfAborted();
        content += text;
        for (const event of preview.push(text)) {
          if (event.type === 'preview') feedback[event.field] += event.text;
          if (event.type === 'annotation') feedback.sentenceAnnotations.push(event.annotation);
          emitted = true; yield event;
        }
      }
      params.signal?.throwIfAborted();
      if (!content.trim()) throw new ProviderFailure('empty');
      const repaired = repairEssayJson(content);
      const parsed = repaired.success ? schema.safeParse(repaired.data) : undefined;
      if (!parsed?.success) {
        context.formatFailure = repaired.success ? 'schema' : 'json';
        context.formatIssueCount = parsed && !parsed.success ? parsed.error.issues.length : undefined;
        // Completed generation may still be discussed as explicitly incomplete
        // feedback. Never surface or save an unvalidated score, or silently retry.
        if (emitted) { yield { type: 'done', data: essayPreviewFeedback(feedback), provider: provider.id }; return; }
        throw new ProviderFailure('json_parse');
      }
      yield { type: 'done', data: parsed.data, provider: provider.id };
      return;
    } catch (error) {
      if (params.signal?.aborted) throw new AppError('ALL_PROVIDERS_FAILED');
      const kind = classify(error);
      // Once a preview is visible, a restarted supplier must not mix new and old
      // feedback. Keep it as a draft; only a fully validated done can be saved.
      if (emitted || !kind) throw new AppError(kind === 'json_parse' ? 'JSON_PARSE_FAILED' : 'ALL_PROVIDERS_FAILED');
    }
  }
  throw new AppError('ALL_PROVIDERS_FAILED');
}
