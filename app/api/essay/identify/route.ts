import 'server-only';
import { listEssayBank, getEssayBankItem } from '@/lib/essay-bank';
import { essayIdentifyRequestSchema, essayIdentificationSchema } from '@/lib/schemas/essay-identification';
import { buildEssayIdentificationPrompt } from '@/lib/prompts/essay-identification';
import { unknownEssayIdentification, validateEssayIdentification } from '@/lib/utils/essay-identification';
import { chatWithFallback } from '@/lib/llm/fallback';
import { repairJson } from '@/lib/utils/json-repair';
import { parseInput, readJson, runApi, validateResult } from '@/lib/utils/api';

export const runtime = 'nodejs';
export async function POST(request: Request): Promise<Response> {
  return runApi(request, async context => {
    const input = parseInput(essayIdentifyRequestSchema, await readJson(request));
    if ((input.essay.match(/[A-Za-z]+/g)?.length ?? 0) < 20) return { data: unknownEssayIdentification('可用英文信息太少，请补充题面和清晰正文。') };
    const { items } = await listEssayBank();
    if (!items.length) return { data: unknownEssayIdentification('当前没有可用题库，请手动填写题目。') };
    const catalog = (await Promise.all(items.map(item => getEssayBankItem(item.id)))).filter(item => item.reviewed);
    if (!catalog.length) return { data: unknownEssayIdentification('当前没有可用的已审核题目，请手动填写题目。') };
    const result = await chatWithFallback({ ...buildEssayIdentificationPrompt(input, catalog), signal: request.signal });
    context.provider = result.provider;
    const parsed = repairJson(result.content);
    const data = validateResult(essayIdentificationSchema, validateEssayIdentification(input, parsed.success ? parsed.data : null, catalog));
    return { data, provider: result.provider };
  }, 'llm');
}
