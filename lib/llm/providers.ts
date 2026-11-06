import 'server-only';
import type { ProviderConfig, ServerEnvironment } from '@/types';

export function getProviders(env: ServerEnvironment = process.env): ProviderConfig[] {
  const candidates: ProviderConfig[] = [
    { id: 'deepseek', apiKey: env.DEEPSEEK_API_KEY?.trim() ?? '', baseURL: env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com', model: env.DEEPSEEK_MODEL?.trim() || 'deepseek-flash' },
    { id: 'siliconflow', apiKey: env.SILICONFLOW_API_KEY?.trim() ?? '', baseURL: env.SILICONFLOW_BASE_URL?.trim() || 'https://api.siliconflow.cn/v1', model: env.SILICONFLOW_MODEL?.trim() || 'deepseek-ai/DeepSeek-V3' },
    { id: 'openrouter', apiKey: env.OPENROUTER_API_KEY?.trim() ?? '', baseURL: env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1', model: env.OPENROUTER_MODEL?.trim() || 'deepseek/deepseek-chat' },
  ];
  return candidates.filter((provider) => provider.apiKey.length > 0);
}
