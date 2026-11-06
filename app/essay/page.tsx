import { PageContainer } from '@/components/layout/PageContainer';
import { EssayForm } from '@/components/essay/EssayForm';
import type { FeaturePageProps, NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '作文批改' };

export default async function EssayPage({ searchParams }: FeaturePageProps) {
  const { history } = await searchParams;
  return <PageContainer width="reading"><EssayForm historyId={history} /></PageContainer>;
}
