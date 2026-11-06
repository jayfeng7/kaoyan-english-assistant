import Link from 'next/link';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';

export default function NotFound() {
  return <PageContainer><Card className="space-y-4 text-center"><h1 className="text-2xl font-semibold">没有找到这个页面</h1><p className="text-sm text-muted">请返回工作台选择学习内容。</p><Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-accent px-5 text-sm text-white">返回工作台</Link></Card></PageContainer>;
}
