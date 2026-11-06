'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MessageBubble } from './MessageBubble';
import { Button } from '@/components/ui/Button';
import { advanceChatScroll } from '@/lib/client/chat-scroll';
import type { ChatWindowProps } from '@/types';
export function ChatWindow({ messages, loading, emptyTitle = '把疑问说清楚', emptyDescription = '可以询问词义、语法或阅读思路，也可以继续上一轮的话题。' }: ChatWindowProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastScrollTop = useRef(0);
  const reviewMoved = useRef(false);
  const [following, setFollowing] = useState(true);
  useLayoutEffect(() => {
    if (followLatest.current && viewport.current) { viewport.current.scrollTop = viewport.current.scrollHeight; lastScrollTop.current = viewport.current.scrollTop; }
  }, [messages]);
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { if (followLatest.current && viewport.current) { viewport.current.scrollTop = viewport.current.scrollHeight; lastScrollTop.current = viewport.current.scrollTop; } });
    if (viewport.current) observer.observe(viewport.current);
    if (content.current) observer.observe(content.current);
    return () => observer.disconnect();
  }, []);
  function returnToLatest() {
    followLatest.current = true; reviewMoved.current = false; setFollowing(true);
    if (viewport.current) { viewport.current.scrollTop = viewport.current.scrollHeight; lastScrollTop.current = viewport.current.scrollTop; }
  }
  function pauseFollowing() {
    if (followLatest.current) reviewMoved.current = false;
    followLatest.current = false; setFollowing(false);
  }
  return <div className="conversation-thread">
    <div ref={viewport} role="log" aria-label="对话记录" aria-busy={loading} tabIndex={0} className="chat-transcript" onScroll={(event) => {
      const element = event.currentTarget; const atEnd = element.scrollHeight - element.clientHeight - element.scrollTop <= 48;
      const next = advanceChatScroll({ following: followLatest.current, reviewMoved: reviewMoved.current, top: lastScrollTop.current }, element.scrollTop, atEnd);
      followLatest.current = next.following; reviewMoved.current = next.reviewMoved; lastScrollTop.current = next.top; setFollowing(next.following);
    }} onPointerDown={pauseFollowing} onWheel={(event) => { if (event.deltaY < 0) pauseFollowing(); }} onKeyDown={(event) => { if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) pauseFollowing(); }}>
      <div ref={content} className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6">{messages.length ? messages.map((message) => <MessageBubble key={message.id} message={message} />) : <div className="flex flex-col justify-center px-2 py-5"><h3 className="text-xl font-semibold">{emptyTitle}</h3><p className="mt-2 max-w-lg text-sm leading-7 text-muted">{emptyDescription}</p></div>}</div>
    </div>
    {!following && messages.length > 0 && <div className="flex justify-center border-t border-line/60 bg-paper/60 px-4"><Button variant="ghost" onClick={returnToLatest} className="min-h-8 py-1 text-xs">回到最新回答 ↓</Button></div>}
  </div>;
}
