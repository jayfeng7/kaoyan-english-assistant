'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { requestApi, messageFor } from '@/lib/client/api';
import { healthDataSchema } from '@/lib/schemas/api';
import type { ProviderId } from '@/types';

const NAMES: Record<ProviderId, string> = { deepseek: 'DeepSeek（主供应商）', siliconflow: '硅基流动（备用）', openrouter: 'OpenRouter（备用）' };
export function ProviderStatus() {
  const [providers, setProviders] = useState<ProviderId[]>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; const controller = new AbortController();
    void requestApi('/api/health', healthDataSchema, { signal: controller.signal }).then(({ data }) => { if (active) setProviders(data.providers); }).catch((cause: unknown) => { if (active) setError(messageFor(cause)); });
    return () => { active = false; controller.abort(); };
  }, []);
  return <Card><h2 className="text-xl font-semibold">供应商偏好：自动切换</h2><p className="mt-3 text-sm leading-7 text-muted">优先使用 DeepSeek；遇到超时、限流或服务异常时，依次尝试已配置的硅基流动、OpenRouter。</p><p className="mt-3 text-sm" role="status">{error || (providers ? `已配置：${providers.map((id) => NAMES[id]).join('、') || '暂无'}` : '正在读取配置状态…')}</p></Card>;
}
