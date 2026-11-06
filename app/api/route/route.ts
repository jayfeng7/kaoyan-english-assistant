import 'server-only';
import { routeRequestSchema, routerResultSchema } from '@/lib/schemas/router';
import { buildRouterPrompt } from '@/lib/prompts/router';
import { generateStructured } from '@/lib/llm/structured';
import { countWords, parseInput, readJson, runApi, validateResult } from '@/lib/utils/api';
export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async (context) => {
    const input = parseInput(routeRequestSchema, await readJson(request)); context.wordCount = countWords(input.input);
    const result = await generateStructured({ ...buildRouterPrompt(input), signal: request.signal }, routerResultSchema, context);
    return { ...result, data: validateResult(routerResultSchema, result.data) };
  }, 'llm');
}
