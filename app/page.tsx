import Link from 'next/link';
import { ArrowUpRight, BookOpenText, MessageCircle, PenLine, ScanText } from 'lucide-react';
import { PageContainer } from '@/components/layout/PageContainer';
import { PageIntro } from '@/components/layout/PageIntro';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { HomeRouter } from '@/components/layout/HomeRouter';

const modules = [
  { href: '/essay', index: '01', title: '作文批改', english: 'Writing', description: '从大小作文出发，理解每一处修改与评分依据。', detail: '英语一 · 英语二 / 大作文 · 小作文', icon: PenLine },
  { href: '/sentence', index: '02', title: '长难句分析', english: 'Sentence', description: '拆开句子结构，读懂主干、从句与修饰关系。', detail: '断句 · 语法 · 翻译 · 仿写', icon: ScanText },
  { href: '/exam', index: '03', title: '真题解析', english: 'Reading', description: '回到文章找依据，理清解题思路与干扰项。', detail: '题库选题 · 粘贴文章 · PDF', icon: BookOpenText },
  { href: '/chat', index: '04', title: '学习答疑', english: 'Conversation', description: '把练习中的疑惑展开聊，逐步梳理英语知识。', detail: '多轮交流 · 随时追问', icon: MessageCircle },
];

export default function HomePage() {
  return (
    <PageContainer>
      <PageIntro eyebrow="Your study desk" title="从理解开始，稳步进阶。" description="一个安静、专注的考研英语学习空间。选择今天要练习的内容，让每一个问题都有清晰的来路。"><div className="flex gap-2 pt-1"><Badge tone="accent">英语一 / 英语二</Badge><Badge>大小作文均支持</Badge></div></PageIntro>
      <HomeRouter />
      <section aria-label="学习功能" className="grid gap-4 sm:grid-cols-2 sm:gap-5">
        {modules.map(({ href, index, title, english, description, detail, icon: Icon }) => <Link key={href} href={href} aria-label={title} className="group rounded-2xl"><Card as="article" className="h-full transition group-hover:border-accent/35 group-hover:shadow-md"><div className="mb-7 flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-accent-soft text-accent"><Icon className="h-5 w-5" aria-hidden="true" /></span><span className="font-serif text-sm text-muted/60">{index}</span></div><div className="mb-3 flex items-baseline gap-3"><h2 className="text-2xl font-semibold">{title}</h2><span className="font-serif text-sm text-muted">{english}</span></div><p className="text-sm leading-7 text-muted">{description}</p><div className="mt-7 flex items-center justify-between gap-2 border-t border-line/70 pt-4"><span className="text-xs text-muted">{detail}</span><ArrowUpRight className="h-4 w-4 shrink-0 text-accent transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" /></div></Card></Link>)}
      </section>
      <p className="mt-7 text-center text-xs leading-6 text-muted">历史记录仅保存在当前浏览器，请定期导出备份。</p>
    </PageContainer>
  );
}
