import 'server-only';
import { chatWithFallback } from './fallback';
import { repairJson } from '@/lib/utils/json-repair';
import { validateResult } from '@/lib/utils/api';
import { textFallbackSchema } from '@/lib/schemas/common';
import type { ApiContext, ApiData, FeatureResult, LlmParams, Schema } from '@/types';

export async function generateStructured<T>(params: LlmParams, schema: Schema<T>, context: ApiContext): Promise<ApiData<FeatureResult<T>>> {
  const result = await chatWithFallback({ ...params, json: true });
  context.provider = result.provider;
  const parsed = repairJson(result.content);
  const data = parsed.success ? validateResult(schema, parsed.data) : validateResult(textFallbackSchema, { text: parsed.text });
  return { data, provider: result.provider };
}
