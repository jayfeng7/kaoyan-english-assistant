import { Card } from './Card';
import type { ResultSectionProps } from '@/types';
export function ResultSection({ title, children }: ResultSectionProps) { return <Card><h2 className="mb-5 text-xl font-semibold">{title}</h2><div className="reading space-y-4 leading-8">{children}</div></Card>; }
