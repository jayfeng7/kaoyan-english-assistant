import 'server-only';
import { essayCorrectRequestSchema, essayReferenceSchema } from '@/lib/schemas/essay';
import { buildEssayReferencePrompt } from '@/lib/prompts/essay-reference';
import { chatWithFallback } from '@/lib/llm/fallback';
import { repairJson } from '@/lib/utils/json-repair';
import { countWords, parseInput, readJson, runApi, validateResult } from '@/lib/utils/api';
import { getEssayBankItem } from '@/lib/essay-bank';
import { essayBankPrompt } from '@/lib/client/essay-input';
import { AppError } from '@/lib/utils/errors';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async context => {
    let input = parseInput(essayCorrectRequestSchema, await readJson(request));
    if (input.source === 'bank') {
      const item = await getEssayBankItem(input.bankId!);
      if (item.type !== input.type || item.composition !== input.composition) throw new AppError('INVALID_INPUT');
      input = { ...input, prompt: essayBankPrompt(item) };
    }
    context.wordCount = countWords(input.essay);
    const result = await chatWithFallback({ ...buildEssayReferencePrompt(input), signal: request.signal });
    context.provider = result.provider;
    const parsed = repairJson(result.content);
    if (!parsed.success) throw new AppError('JSON_PARSE_FAILED');
    return { data: validateResult(essayReferenceSchema, parsed.data), provider: result.provider };
  }, 'llm');
}
