import 'server-only';
import { groundedEssaySchema, groundedScoreSchema } from '@/lib/schemas/essay-evidence';
import { annotationHasEssayEvidence } from '@/lib/utils/essay-evidence';
import { AppError } from '@/lib/utils/errors';
import { streamEssay } from './essay-stream';
import { createEssayStreamEventSchema, createEssayScoreCardSchema } from '@/lib/schemas/essay';
import { finishRequest, safeError, validateResult } from '@/lib/utils/api';
import type { ApiContext, EssayCorrectRequest, EssayReport, EssayStreamEvent, ErrorCode, LlmParams, Schema } from '@/types';

export function essayStreamResponse(request: Request, input: EssayCorrectRequest, params: LlmParams, schema: Schema<EssayReport>, context: ApiContext): Response {
  const abort = new AbortController();
  const signal = AbortSignal.any([request.signal, abort.signal]);
  const iterator = streamEssay({ ...params, signal }, groundedEssaySchema(schema, input.essay), context, { scoreSchema: groundedScoreSchema(createEssayScoreCardSchema(input.type, input.composition), input.essay) });
  const eventSchema = createEssayStreamEventSchema(input.type, input.composition);
  const encoder = new TextEncoder(); let finished = false; let cancelled = false;
  const finish = (code?: ErrorCode) => { if (!finished) { finished = true; finishRequest(context, code); } };
  const encode = (event: EssayStreamEvent) => encoder.encode(`data: ${JSON.stringify(validateResult(eventSchema, event, 'INTERNAL_ERROR'))}\n\n`);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (cancelled) return;
        if (next.done) { controller.close(); finish(); return; }
        if (next.value.type === 'annotation' && !annotationHasEssayEvidence(next.value.annotation, input.essay)) throw new AppError('JSON_PARSE_FAILED');
        if (next.value.type === 'done' && !('text' in next.value.data)) validateResult(groundedEssaySchema(schema, input.essay), next.value.data, 'JSON_PARSE_FAILED');
        controller.enqueue(encode(next.value));
        if (next.value.type === 'done') { await iterator.return(undefined); controller.close(); finish('text' in next.value.data ? 'JSON_PARSE_FAILED' : undefined); }
      } catch (error) {
        if (cancelled) return;
        const friendly = safeError(error);
        if (!signal.aborted) controller.enqueue(encode({ type: 'error', message: friendly.message, code: friendly.code }));
        controller.close(); finish(friendly.code);
      }
    },
    async cancel() { cancelled = true; abort.abort(); await iterator.return(undefined); finish('ALL_PROVIDERS_FAILED'); },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', Vary: 'Accept' } });
}
