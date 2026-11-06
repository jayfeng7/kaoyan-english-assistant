'use client';
import { memo } from 'react';
import { Markdown } from '@/components/ui/Markdown';
import type { MessageBubbleProps } from '@/types';
export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  return (
    <article aria-label={message.role === 'user' ? '我的问题' : '助手回答'} className={`min-w-0 rounded-2xl p-4 sm:p-5 ${message.role === 'user' ? 'ml-auto max-w-[90%] bg-accent-soft' : 'bg-white'}`}>
      <p className="mb-3 text-xs text-muted">{message.role === 'user' ? '我的问题' : '学习助手'}{message.provider ? ` · ${message.provider}` : ''}</p>
      <div className="reading"><Markdown content={message.content || (message.status === 'streaming' ? '正在思考…' : '回答未完成，请重试')} /></div>
      {!!message.citations?.length && (
        <details className="mt-3 rounded-xl bg-accent-soft p-3 text-sm">
          <summary className="cursor-pointer">参考来源（{message.citations.length}）</summary>
          <ul className="mt-2 space-y-3">
            {message.citations.map((source) => (
              <li key={source.id}>
                <p className="font-medium">〔{source.label}〕{source.title}</p>
                <p>{source.excerpt}</p>
                <p lang="en">{source.example}</p>
                <p className="text-xs text-muted">项目原创教学卡 · {source.id}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {message.status === 'error' && <p className="mt-3 text-sm text-red-700">回答中断，已有文字已保留。</p>}
    </article>
  );
});
