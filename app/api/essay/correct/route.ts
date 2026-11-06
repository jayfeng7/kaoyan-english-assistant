import 'server-only';
import { essayCorrectRequestSchema, createEssayResultSchema, createEssayCoreResultSchema } from '@/lib/schemas/essay';
import { groundedEssaySchema } from '@/lib/schemas/essay-evidence';
import { buildEssayPrompt } from '@/lib/prompts/essay';
import { generateStructured } from '@/lib/llm/structured';
import { essayStreamResponse } from '@/lib/llm/essay-response';
import { countWords, createApiContext, errorResponse, finishRequest, limitRequest, parseInput, readJson, runApi, safeError } from '@/lib/utils/api';
import { getEssayBankItem } from '@/lib/essay-bank';
import { essayBankPrompt } from '@/lib/client/essay-input';
import { AppError } from '@/lib/utils/errors';
import { essayReviewReason, EssayReviewRequiredError } from '@/lib/utils/essay-safety';
import type { ApiContext, EssayReport } from '@/types';

export const runtime = 'nodejs';
async function prepareInput(request: Request, context: ApiContext) {
    let input = parseInput(essayCorrectRequestSchema, await readJson(request));
    const reviewReason = essayReviewReason(input);
    if (reviewReason) throw new EssayReviewRequiredError(input, reviewReason);
    if (input.source === 'bank') {
      const item = await getEssayBankItem(input.bankId!);
      if (item.type !== input.type || item.composition !== input.composition) throw new AppError('INVALID_INPUT');
      input = { ...input, prompt: essayBankPrompt(item) };
    }
    context.wordCount = countWords(input.essay);
    // Provenance gates grading; historical OCR confidence must never become a student deduction.
    const scoringInput = { ...input };
    delete scoringInput.inputEvidence;
    return scoringInput;
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get('Accept')?.split(',').some(value => value.split(';')[0]?.trim().toLowerCase() === 'text/event-stream')) {
    const context = createApiContext();
    try {
      limitRequest(request, 'llm', context);
      const input = await prepareInput(request, context);
      return essayStreamResponse(request, input, buildEssayPrompt({ ...input, wordCount: context.wordCount }), groundedEssaySchema<EssayReport>(input.report === 'core' ? createEssayCoreResultSchema(input.type, input.composition) : createEssayResultSchema(input.type, input.composition), input.essay), context);
    } catch (error) { finishRequest(context, safeError(error).code); return errorResponse(error, context); }
  }
  const response = await runApi(request, async (context) => {
    const input = await prepareInput(request, context);
    return generateStructured<EssayReport>({ ...buildEssayPrompt({ ...input, wordCount: context.wordCount }), signal: request.signal }, groundedEssaySchema<EssayReport>(input.report === 'core' ? createEssayCoreResultSchema(input.type, input.composition) : createEssayResultSchema(input.type, input.composition), input.essay), context);
  }, 'llm');
  response.headers.set('Vary', 'Accept');
  return response;
}
