'use client';
import { useState } from 'react';
import { ConversationPanel } from '@/components/chat/ConversationPanel';
import { useConversation } from '@/lib/client/conversation';
import { followUpContext } from '@/lib/client/follow-up';
import { persistFeature } from '@/lib/client/history';
import type { FeatureData, FeatureFollowUpProps } from '@/types';

export function FollowUpInput<T extends FeatureData>({ record, onChange, disabled, onSettled }: FeatureFollowUpProps<T>) {
  const [text, setText] = useState('');
  const kind = record && 'essay' in record ? 'essay' : record && 'sentence' in record ? 'sentence' : 'exam';
  const incomplete = kind === 'essay' && record?.result && 'text' in record.result;
  const conversation = useConversation({ getMessages: () => record?.followUps ?? [], onMessages: (messages) => { if (record) onChange({ ...record, followUps: messages }); }, onSettled: async (messages) => { if (record) { const updated = { ...record, followUps: messages }; if (onSettled) await onSettled(updated); else await persistFeature(kind, updated); } }, historyId: record?.id, followUp: record?.result ? followUpContext(record) : undefined });
  return <ConversationPanel compact title={kind === 'essay' ? '继续提问' : '继续追问'} description={kind === 'essay' ? incomplete ? '本次未完成评分。' : undefined : undefined} messages={record?.followUps ?? []} loading={conversation.loading} error={conversation.error} emptyTitle="" emptyDescription=""
    onRetry={() => { void conversation.retry().then((success) => { if (success && text === conversation.retryText) setText(''); }); }}
    input={{ label: kind === 'essay' ? '关于这篇作文的问题' : '追问当前结果', placeholder: kind === 'essay' ? '输入问题' : undefined, value: text, onChange: setText, disabled: disabled || !record?.result, loading: conversation.loading, onStop: conversation.stop, onSend: () => { void conversation.send(text).then((success) => { if (success) setText(''); }); } }}
  />;
}
