'use client';
import { uuid } from '@/lib/utils/uuid';
import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { ConversationPanel } from './ConversationPanel';
import { useWorkspace } from '@/lib/client/workspace';
import { useConversation } from '@/lib/client/conversation';
import { useRestoreHistory, persistFeature } from '@/lib/client/history';
import { chatDataSchema } from '@/lib/schemas/storage';
import type { ChatData, ChatMessage, HistoryFormProps } from '@/types';

function newChat(): ChatData { const now = Date.now(); return { id: uuid(), title: '', messages: [], createdAt: now, updatedAt: now }; }
export function ChatScreen({ historyId }: HistoryFormProps) {
  const record = useWorkspace((state) => state.chat); const input = useWorkspace((state) => state.chatInput); const ready = useWorkspace((state) => state.ready);
  useEffect(() => { if (ready && !useWorkspace.getState().chat) useWorkspace.setState({ chat: newChat() }); }, [ready]);
  const restoring = useRestoreHistory(historyId, 'chat', chatDataSchema, (chat) => useWorkspace.setState({ chat }));
  const snapshot = (messages: ChatMessage[]): ChatData | undefined => record ? { ...record, messages, title: messages.find((message) => message.role === 'user')?.content.slice(0, 32) ?? '', updatedAt: Date.now() } : undefined;
  const conversation = useConversation({ historyId: record?.id, getMessages: () => record?.messages ?? [], onMessages: (messages) => { const updated = snapshot(messages); if (updated && useWorkspace.getState().chat?.id === updated.id) useWorkspace.setState({ chat: updated }); }, onStarted: async (messages) => { const updated = snapshot(messages); if (updated) await persistFeature('chat', updated); }, onSettled: async (messages) => { const updated = snapshot(messages); if (updated) await persistFeature('chat', updated); } });
  return <div className="chat-workspace"><ConversationPanel workspace key={record?.id ?? 'new'} title={record?.title || '学习答疑'} description="词义、语法、阅读思路，都可以在这里接着讨论。" messages={record?.messages ?? []} loading={conversation.loading} error={conversation.error}
    actions={<Button variant="secondary" disabled={conversation.loading || !ready || restoring} onClick={() => useWorkspace.setState({ chat: newChat() })}>新对话</Button>}
    onRetry={() => { void conversation.retry().then((success) => { if (success && useWorkspace.getState().chatInput === conversation.retryText) useWorkspace.setState({ chatInput: '' }); }); }}
    input={{ value: input, onChange: (chatInput) => useWorkspace.setState({ chatInput }), loading: conversation.loading, disabled: !ready || restoring || !record, onStop: conversation.stop, onSend: () => { void conversation.send(input).then((success) => { if (success && useWorkspace.getState().chatInput === input) useWorkspace.setState({ chatInput: '' }); }); } }}
  /></div>;
}
