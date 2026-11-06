import { ChatScreen } from '@/components/chat/ChatScreen';
import type { FeaturePageProps, NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '学习答疑' };

export default async function ChatPage({ searchParams }: FeaturePageProps) {
  const { history } = await searchParams;
  return <main id="main-content" className="chat-page"><h1 className="sr-only">学习答疑</h1><ChatScreen historyId={history} /></main>;
}
