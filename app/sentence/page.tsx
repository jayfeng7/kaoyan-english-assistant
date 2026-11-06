import { PageContainer } from '@/components/layout/PageContainer';
import { PageIntro } from '@/components/layout/PageIntro';
import { SentenceForm } from '@/components/sentence/SentenceForm';
import type { FeaturePageProps, NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '长难句分析' };

export default async function SentencePage({ searchParams }: FeaturePageProps) {
  const { history } = await searchParams;
  return <PageContainer><PageIntro eyebrow="Sentence" title="读懂句子的层次" description="从主干到修饰，逐步梳理句子结构、翻译与语法，再通过仿写巩固理解。" /><SentenceForm historyId={history} /></PageContainer>;
}
