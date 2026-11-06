'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, BookOpenText, History, House, MessageCircle, PenLine, ScanText, Settings } from 'lucide-react';
import type { NavigationItem } from '@/types';

const items: readonly NavigationItem[] = [
  { href: '/', label: '工作台', icon: House },
  { href: '/essay', label: '作文', icon: PenLine },
  { href: '/sentence', label: '长难句', icon: ScanText },
  { href: '/exam', label: '真题', icon: BookOpenText },
  { href: '/chat', label: '聊天', icon: MessageCircle },
  { href: '/history', label: '历史', icon: History },
  { href: '/settings', label: '设置', icon: Settings },
];

function NavigationPending() {
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="absolute right-1 top-1 h-3 w-3 animate-spin rounded-full border-2 border-accent/20 border-t-accent lg:right-3 lg:top-4"><span className="sr-only">正在打开页面</span></span> : null;
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav data-app-chrome aria-label="主导航" className="app-navigation fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:inset-y-0 lg:right-auto lg:flex lg:w-52 lg:flex-col lg:border-r lg:border-t-0 lg:bg-paper lg:p-4">
      <Link href="/" className="mb-8 hidden items-center gap-2 py-3 font-serif font-semibold text-accent lg:flex"><BookOpen className="h-6 w-6 shrink-0" aria-hidden="true" /><span>考研英语 AI 助手</span></Link>
      <div className="mx-auto grid w-full max-w-3xl grid-cols-7 px-1 py-1 lg:grid-cols-1 lg:gap-1 lg:p-0">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
          return <Link key={href} href={href} aria-current={active ? 'page' : undefined} className={`relative mx-0.5 flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[10px] font-medium transition sm:text-xs lg:mx-0 lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-sm ${active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-white hover:text-ink'}`}><Icon className="h-5 w-5 shrink-0" aria-hidden="true" /><span className="whitespace-nowrap">{label}</span><NavigationPending /></Link>;
        })}
      </div>
      <p className="mt-auto hidden px-3 pb-2 text-xs leading-6 text-muted lg:block">专注理解，逐步进步。<br />历史仅保存在当前浏览器</p>
    </nav>
  );
}
