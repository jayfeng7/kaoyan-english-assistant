import 'server-only';
import OpenAI from 'openai';
import type { FailureKind, LlmParams, OpenAIClient, ProviderConfig, ProviderChatRequest } from '@/types';

export class ProviderFailure extends Error {
  readonly kind: FailureKind;
  constructor(kind: FailureKind) { super(kind); this.name = 'ProviderFailure'; this.kind = kind; }
}

export function createProviderClient(provider: ProviderConfig): OpenAIClient {
  return new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL, timeout: 60_000, maxRetries: 0, logLevel: 'off' });
}

// 结构化结果（作文/真题）正文较长，供应商默认 4K 输出容易被截断导致 JSON 解析失败。
// 默认放宽到 8K，可通过 LLM_MAX_TOKENS 覆盖（需供应商支持）。
function maxTokens(): number {
  const value = Number(process.env.LLM_MAX_TOKENS ?? 8000);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 8000;
}

export function buildProviderRequest(provider: ProviderConfig, params: LlmParams): ProviderChatRequest {
  return {
    model: provider.model,
    messages: [{ role: 'system', content: params.system }, { role: 'user', content: params.user }],
    temperature: params.temperature ?? 0.3,
    max_tokens: params.maxTokens ?? maxTokens(),
    ...(params.json ? { response_format: { type: 'json_object' as const } } : {}),
    ...(provider.id === 'deepseek' && params.json ? { thinking: { type: 'disabled' as const } } : {}),
  };
}

export async function callProvider(provider: ProviderConfig, params: LlmParams): Promise<string> {
  const completion = await createProviderClient(provider).chat.completions.create(buildProviderRequest(provider, params), { signal: params.signal });
  return completion.choices[0]?.message.content ?? '';
}

export function classify(error: unknown): FailureKind | undefined {
  if (error instanceof ProviderFailure) return error.kind;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return 'timeout';
  if (error instanceof OpenAI.APIConnectionError) return 'server_error';
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timeout';
  if (typeof error !== 'object' || error === null) return undefined;
  if ('kind' in error && ['timeout', 'rate_limit', 'server_error', 'empty', 'json_parse'].includes(String(error.kind))) {
    const kind = error.kind;
    if (kind === 'timeout' || kind === 'rate_limit' || kind === 'server_error' || kind === 'empty' || kind === 'json_parse') return kind;
  }
  if ('status' in error && typeof error.status === 'number') {
    if (error.status === 429) return 'rate_limit';
    if (error.status === 408 || error.status === 504) return 'timeout';
    if (error.status >= 500 && error.status <= 599) return 'server_error';
  }
  return undefined;
}
