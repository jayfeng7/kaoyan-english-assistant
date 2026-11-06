'use client';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { HistoryItemProps } from '@/types';
const labels = { essay: '作文批改', sentence: '长难句', exam: '真题解析', chat: '学习答疑' };
export function HistoryItem({ record, onDelete }: HistoryItemProps) { return <Card as="article"><div className="flex items-center justify-between gap-3"><Badge tone="accent">{labels[record.type]}</Badge><time className="text-xs text-muted" dateTime={new Date(record.updatedAt).toISOString()}>{new Date(record.updatedAt).toLocaleString('zh-CN')}</time></div><Link href={`/${record.type}?history=${encodeURIComponent(record.id)}`} className="mt-4 block rounded-lg"><h2 className="break-words text-xl font-semibold">{record.title || '未命名记录'}</h2><p className="mt-3 break-words text-sm leading-7 text-muted">{record.preview}</p><p className="mt-4 text-sm text-accent">打开记录 →</p></Link><div className="mt-3 flex justify-end"><Button variant="ghost" onClick={() => onDelete(record)}>删除</Button></div></Card>; }
