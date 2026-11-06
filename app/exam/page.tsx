import { PageContainer } from '@/components/layout/PageContainer';
import { PageIntro } from '@/components/layout/PageIntro';
import { ExamForm } from '@/components/exam/ExamForm';
import type { FeaturePageProps, NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '真题解析' };

export default async function ExamPage({ searchParams }: FeaturePageProps) {
  const { history } = await searchParams;
  return <PageContainer><PageIntro eyebrow="Reading" title="让答案回到原文" description="选择真题、粘贴文章或上传 PDF，在精读中找准定位，理解选项之间的差别。" /><ExamForm historyId={history} /></PageContainer>;
}
