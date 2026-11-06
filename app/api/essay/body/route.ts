import 'server-only';
import { essayBodyRequestSchema } from '@/lib/schemas/essay-body';
import { extractEssayBody } from '@/lib/llm/essay-body';
import { countWords, limitRequest, parseInput, readJson, runApi } from '@/lib/utils/api';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async context => {
    const input = parseInput(essayBodyRequestSchema, await readJson(request));
    context.wordCount = countWords(input.text);
    return extractEssayBody(input.text, request.signal, () => limitRequest(request, 'llm', context));
  });
}
