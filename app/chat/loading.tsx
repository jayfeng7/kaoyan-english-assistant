import { Skeleton } from '@/components/ui/Skeleton';

export default function ChatLoading() {
  return <main id="main-content" className="chat-page" aria-busy="true"><h1 className="sr-only">正在打开学习答疑</h1><section className="conversation-panel" data-workspace="true"><div className="border-b border-line p-4"><Skeleton className="h-6 w-32" /></div><div className="flex-1 space-y-5 p-6"><Skeleton className="ml-auto h-12 w-1/2" /><Skeleton className="h-28 w-4/5" /></div><div className="chat-composer"><Skeleton className="h-12 w-full" /></div></section></main>;
}
