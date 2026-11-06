'use client';

import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import type { ErrorPageProps } from '@/types';

export default function ErrorPage({ reset }: ErrorPageProps) {
  return <PageContainer><Card className="space-y-4 text-center"><h1 className="text-2xl font-semibold">页面暂时无法显示</h1><p className="text-sm text-muted">请稍后重试，或从底部导航返回工作台。</p><Button onClick={reset}>重新加载</Button></Card></PageContainer>;
}
