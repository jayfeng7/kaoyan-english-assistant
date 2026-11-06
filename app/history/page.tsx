import { PageContainer } from '@/components/layout/PageContainer';
import { PageIntro } from '@/components/layout/PageIntro';
import { HistoryList } from '@/components/history/HistoryList';
import type { NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '历史记录' };

export default function HistoryPage() {
  return <PageContainer><PageIntro eyebrow="Your progress" title="回看每一次练习" description="历史仅保存在当前浏览器。清除浏览器数据前，请先导出 JSON 备份。" /><HistoryList /></PageContainer>;
}
