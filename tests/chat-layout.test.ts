import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConversationPanel } from '@/components/chat/ConversationPanel';
import type { ChatInputProps, ChatMessage } from '@/types';

const input: ChatInputProps = { value: '保留我的问题', loading: false, onChange: () => undefined, onSend: () => undefined, onStop: () => undefined };
const message: ChatMessage = { id: 'test-message', role: 'assistant', content: '已经生成的部分回答。', status: 'streaming', createdAt: 1 };

describe('shared conversation interaction states', () => {
  it('keeps the draft and partial response visible while allowing stop but disabling send', () => {
    const html = renderToStaticMarkup(createElement(ConversationPanel, { title: '继续追问', messages: [message], loading: true, input: { ...input, loading: true } }));
    expect(html).toContain('已经生成的部分回答。'); expect(html).toContain('保留我的问题');
    expect(html).toMatch(/role="log"[^>]*aria-busy="true"/);
    expect(html).toMatch(/<textarea[^>]*disabled=""/);
    const stop = html.match(/<button[^>]*aria-label="停止回答"[^>]*>/)?.[0]; expect(stop).toBeDefined(); expect(stop).not.toMatch(/\sdisabled(?:=|\s|>)/);
    expect(html).not.toContain('aria-label="发送问题"');
  });
  it('preserves interrupted text and the question with an available retry action', () => {
    const html = renderToStaticMarkup(createElement(ConversationPanel, { title: '继续追问', messages: [{ ...message, status: 'error' }], error: '连接中断，请重试', onRetry: () => undefined, input }));
    for (const text of ['已经生成的部分回答。', '保留我的问题', '回答中断，已有文字已保留。', '连接中断，请重试', '重试']) expect(html).toContain(text);
    expect(html).not.toContain('停止回答'); expect(html).not.toContain('正在生成回答，可随时停止。');
    expect(html).not.toMatch(/<textarea[^>]*disabled=""/);
  });
  it('keeps follow-up unavailable without a result and renders the explanation', () => {
    const html = renderToStaticMarkup(createElement(ConversationPanel, { title: '继续追问', messages: [], description: '生成分析结果后，可以在这里继续提问。', input: { ...input, disabled: true } }));
    expect(html).toContain('生成分析结果后，可以在这里继续提问。'); expect(html).toMatch(/<textarea[^>]*disabled=""/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });
});
