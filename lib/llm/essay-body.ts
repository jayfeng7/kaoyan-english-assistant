import 'server-only';
import { essayBodyRequestSchema, essayBodyRangesSchema, essayBodySelectionSchema } from '@/lib/schemas/essay-body';
import { buildEssayBodyPrompt } from '@/lib/prompts/essay-body';
import { selectEssayBody, selectMarkedEssayBody } from '@/lib/utils/essay-body';
import { repairJson } from '@/lib/utils/json-repair';
import { chatWithFallback } from './fallback';
import type { ApiData, EssayBodySelection } from '@/types';

export async function extractEssayBody(text: string, signal: AbortSignal, beforeModel: () => void): Promise<ApiData<EssayBodySelection>> {
  const input = essayBodyRequestSchema.parse({ text });
  signal.throwIfAborted();
  const fast = selectMarkedEssayBody(input.text);
  if (fast) return { data: fast };
  beforeModel();
  const result = await chatWithFallback({ ...buildEssayBodyPrompt(input), signal });
  signal.throwIfAborted();
  const parsed = repairJson(result.content);
  const ranges = parsed.success ? essayBodyRangesSchema.safeParse(parsed.data) : undefined;
  try {
    const data = ranges?.success ? essayBodySelectionSchema.parse(selectEssayBody(text, ranges.data)) : { text: '', status: 'review' as const, excludedLines: 0 };
    return { data, provider: result.provider };
  } catch { return { data: { text: '', status: 'review', excludedLines: 0 }, provider: result.provider }; }
}
