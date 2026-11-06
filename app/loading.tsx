import { PageContainer } from '@/components/layout/PageContainer';
import { Skeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return <PageContainer><Skeleton className="mb-4 h-5 w-32" /><Skeleton className="mb-8 h-10 w-64 max-w-full" /><div className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-60" /><Skeleton className="h-60" /></div></PageContainer>;
}
