import 'server-only';
import { callProvider, classify, ProviderFailure } from './client';
import { getProviders } from './providers';
import { repairJson } from '@/lib/utils/json-repair';
import { AppError } from '@/lib/utils/errors';
import type { FallbackOptions, LlmParams, LlmResult } from '@/types';

export async function chatWithFallback(params: LlmParams, options: FallbackOptions = {}): Promise<LlmResult> {
  const providers = options.providers ?? getProviders();
  const call = options.call ?? callProvider;
  let textFallback: LlmResult | undefined;
  for (const provider of providers) {
    try {
      const content = await call(provider, params);
      if (!content.trim()) throw new ProviderFailure('empty');
      if (params.json) {
        const repaired = repairJson(content);
        if (!repaired.success) {
          textFallback = { content, provider: provider.id };
          throw new ProviderFailure('json_parse');
        }
        return { content: JSON.stringify(repaired.data), provider: provider.id };
      }
      return { content, provider: provider.id };
    } catch (error) {
      if (!classify(error)) throw new AppError('ALL_PROVIDERS_FAILED');
    }
  }
  // Network/provider failures have no usable content. Nonempty malformed JSON can
  // still be displayed as text by the route after all configured backups are tried.
  if (textFallback) return textFallback;
  throw new AppError('ALL_PROVIDERS_FAILED');
}
