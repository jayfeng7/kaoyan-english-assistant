import 'server-only';
import { chatRequestSchema, chatStreamEventSchema } from '@/lib/schemas/chat';
import { buildChatPrompt } from '@/lib/prompts/chat';
import { streamWithFallback } from '@/lib/llm/stream';
import { createEssayGrounding } from '@/lib/rag';
import { countWords, createApiContext, errorResponse, finishRequest, limitRequest, parseInput, readJson, safeError, validateResult } from '@/lib/utils/api';
import type { ChatStreamEvent, ErrorCode } from '@/types';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  const context = createApiContext();
  try {
    limitRequest(request, 'llm', context);
    const input = parseInput(chatRequestSchema, await readJson(request));
    context.wordCount = input.messages.reduce((count, message) => count + countWords(message.content), 0);
    const abort = new AbortController();
    const signal = AbortSignal.any([request.signal, abort.signal]);
    const grounding = createEssayGrounding(input);
    const iterator = streamWithFallback({ ...buildChatPrompt(input, grounding?.instructions), signal }, { onProvider: (provider) => { context.provider = provider; } });
    const encoder = new TextEncoder(); let finished = false; let cancelled = false;
    const finish = (code?: ErrorCode) => { if (!finished) { finished = true; finishRequest(context, code); } };
    const encode = (event: ChatStreamEvent) => encoder.encode(`data: ${JSON.stringify(validateResult(chatStreamEventSchema, event, 'INTERNAL_ERROR'))}\n\n`);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          // A delta may contain only an incomplete citation. Keep pulling until
          // there is output or the provider finishes so the reader never stalls.
          while (!cancelled) {
            const next = await iterator.next();
            if (cancelled) return;
            if (next.done) { controller.close(); finish(); return; }
            const event = next.value;
            if (event.type === 'delta' && grounding) {
              const content = grounding.filterDelta(event.content);
              if (!content) continue;
              controller.enqueue(encode({ type: 'delta', content }));
            } else if (event.type === 'done') {
              const citations = grounding?.citations();
              controller.enqueue(encode(citations?.length ? { ...event, citations } : event));
              await iterator.return(undefined); controller.close(); finish();
            } else {
              controller.enqueue(encode(event));
            }
            return;
          }
        } catch (error) {
          if (cancelled) return;
          const friendly = safeError(error);
          if (!signal.aborted) controller.enqueue(encode({ type: 'error', message: friendly.message, code: friendly.code }));
          controller.close(); finish(friendly.code);
        }
      },
      async cancel() { cancelled = true; abort.abort(); await iterator.return(undefined); finish('ALL_PROVIDERS_FAILED'); },
    });
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' } });
  } catch (error) { finishRequest(context, safeError(error).code); return errorResponse(error, context); }
}
