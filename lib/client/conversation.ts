'use client';
import { uuid } from '@/lib/utils/uuid';
import { useEffect, useRef, useState } from 'react';
import { consumeChat, ClientFailure, messageFor } from './api';
import { useToast } from '@/components/ui/Toast';
import { createStreamPublisher } from './stream-publisher';
import type { ChatMessage, ConversationFailure, ConversationOptions } from '@/types';

export function useConversation(options: ConversationOptions) {
  const [failure, setFailure] = useState<ConversationFailure>();
  const activeFailure = failure?.historyId === options.historyId ? failure : undefined;
  const retryText = activeFailure?.retryText;
  const [loading, setLoading] = useState(false); const active = useRef<AbortController | undefined>(undefined); const optionsRef = useRef(options);
  const { notify } = useToast();
  useEffect(() => { optionsRef.current = options; }, [options]);
  useEffect(() => () => { active.current?.abort(); }, []);
  async function send(text: string): Promise<boolean> {
    if (!text.trim() || active.current) return false;
    const current = optionsRef.current; const controller = new AbortController(); active.current = controller; setLoading(true); setFailure(undefined);
    const timer = setTimeout(() => controller.abort(), 200_000);
    const original = current.getMessages();
    const base = original.at(-1)?.status === 'error' && original.at(-2)?.role === 'user' && original.at(-2)?.content === text ? original.slice(0, -2) : original;
    const user: ChatMessage = { id: uuid(), role: 'user', content: text, createdAt: Date.now(), status: 'done' };
    const assistant: ChatMessage = { id: uuid(), role: 'assistant', content: '', createdAt: Date.now(), status: 'streaming' };
    let messages = [...base, user, assistant];
    const update = () => current.onMessages([...base, user, { ...assistant }]);
    const publisher = createStreamPublisher(update);
    update(); let success = false;
    try {
      await current.onStarted?.(messages);
      await consumeChat({ messages: [...base.filter((message) => message.status === 'done'), user].map(({ role, content }) => ({ role, content })), historyId: current.historyId, followUp: current.followUp }, (event) => {
        if (event.type === 'delta') assistant.content += event.content;
        if (event.type === 'done') {
          assistant.status = 'done'; assistant.provider = event.provider;
          if (event.citations?.length) assistant.citations = event.citations;
          if (event.provider !== 'deepseek') notify('已切换到备用模型');
        }
        messages = [...base, user, { ...assistant }];
        if (event.type === 'delta') publisher.schedule(); else publisher.flush();
      }, controller.signal);
      success = true;
    } catch (error) {
      assistant.status = 'error'; messages = [...base, user, { ...assistant }]; publisher.flush();
      const text = controller.signal.aborted ? '回答已停止或超时，已有文字和问题已保留' : messageFor(error instanceof Error ? error : new ClientFailure('网络连接失败，请重试'));
      setFailure({ historyId: current.historyId, message: text, retryText: user.content }); notify(text, 'error');
    } finally {
      clearTimeout(timer);
      publisher.cancel();
      try { await current.onSettled(messages); } catch { notify('历史保存未完成，当前内容仍可查看，请导出备份', 'error'); }
      if (active.current === controller) active.current = undefined;
      setLoading(false);
    }
    return success;
  }
  return { loading, error: activeFailure?.message, retryText, send, retry: () => retryText ? send(retryText) : Promise.resolve(false), stop: () => active.current?.abort() };
}
