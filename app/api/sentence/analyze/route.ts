import 'server-only';
import { sentenceAnalyzeRequestSchema, sentenceResultSchema } from '@/lib/schemas/sentence';
import { buildSentencePrompt } from '@/lib/prompts/sentence';
import { generateStructured } from '@/lib/llm/structured';
import { countWords, parseInput, readJson, runApi } from '@/lib/utils/api';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async (context) => {
    const input = parseInput(sentenceAnalyzeRequestSchema, await readJson(request));
    context.wordCount = countWords(input.sentence);
    return generateStructured({ ...buildSentencePrompt(input), signal: request.signal }, sentenceResultSchema, context);
  }, 'llm');
}
