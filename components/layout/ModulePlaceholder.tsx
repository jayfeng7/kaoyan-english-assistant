import { BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/Card';

export function ModulePlaceholder() {
  return <Card className="flex min-h-60 flex-col items-center justify-center gap-4 text-center"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-accent-soft text-accent"><BookOpen aria-hidden="true" className="h-5 w-5" /></span><h2 className="text-xl font-semibold">学习空间正在准备中</h2><p className="max-w-sm text-sm leading-7 text-muted">功能开放后，你可以在这里开始练习，查看分析，并继续追问。</p></Card>;
}
