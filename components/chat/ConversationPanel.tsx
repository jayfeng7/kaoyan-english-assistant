'use client';
import { ChatWindow } from './ChatWindow';
import { ChatInput } from './ChatInput';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import type { ConversationPanelProps } from '@/types';

export function ConversationPanel({ title, description, messages, loading, emptyTitle, emptyDescription, input, error, onRetry, actions, compact, workspace }: ConversationPanelProps) {
  return <section className="conversation-panel" data-empty={messages.length === 0 || undefined} data-compact={compact || undefined} data-workspace={workspace || undefined} data-error={Boolean(error) || undefined} aria-label={title}>
    <header className="conversation-heading flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
      <div className="min-w-0 flex-1"><h2 title={title} className="truncate text-base font-semibold">{title}</h2>{loading ? <p role="status" className={workspace ? 'sr-only' : 'mt-1 text-xs leading-6 text-accent'}>正在生成回答，可随时停止。</p> : description && <p className={workspace ? 'sr-only' : 'mt-1 hidden text-xs leading-6 text-muted sm:block'}>{description}</p>}</div>
      {actions}
    </header>
    <ChatWindow messages={messages} loading={loading} emptyTitle={emptyTitle} emptyDescription={emptyDescription} />
    {error && <div className="conversation-feedback shrink-0 overflow-y-auto px-4 pb-2"><TaskFeedback error={error} onRetry={onRetry} disabled={loading || input.disabled} /></div>}
    <div className="chat-composer"><ChatInput {...input} /></div>
  </section>;
}
