import './globals.css';
import { Header } from '@/components/layout/Header';
import { BottomNav } from '@/components/layout/BottomNav';
import { ToastProvider } from '@/components/ui/Toast';
import { ClientProvider } from '@/components/layout/ClientProvider';
import type { ChildrenProps, NextMetadata } from '@/types';

export const metadata: NextMetadata = {
  title: { default: '考研英语 AI 助手', template: '%s · 考研英语 AI 助手' },
  description: '面向考研英语一与英语二的作文批改、长难句分析、真题解析与学习答疑。',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: ChildrenProps) {
  return <html lang="zh-CN"><body><a href="#main-content" className="sr-only z-50 rounded-xl bg-white p-3 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">跳转到主要内容</a><ToastProvider><ClientProvider><BottomNav /><div className="app-main"><Header />{children}</div></ClientProvider></ToastProvider></body></html>;
}
