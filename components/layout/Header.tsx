import Link from 'next/link';
import { BookOpen } from 'lucide-react';

export function Header() {
  return (
    <header data-app-chrome className="app-header shrink-0 border-b border-line/80 bg-paper/95 lg:hidden">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 items-center gap-3" aria-label="考研英语 AI 助手，返回工作台">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white"><BookOpen className="h-4 w-4" aria-hidden="true" /></span>
          <span className="block font-serif text-base font-semibold tracking-wide">考研英语 AI 助手</span>
        </Link>
        <span className="hidden text-xs text-muted sm:block">专注理解，让每一次练习有所得。</span>
      </div>
    </header>
  );
}
