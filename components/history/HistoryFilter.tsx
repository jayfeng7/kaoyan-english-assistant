'use client';
import { Input } from '@/components/ui/Input';
import { SelectField } from '@/components/ui/SelectField';
import { historyTypeSchema } from '@/lib/schemas/common';
import type { HistoryFilterProps } from '@/types';
export function HistoryFilter({ type, query, onType, onQuery }: HistoryFilterProps) { return <div className="grid gap-4 sm:grid-cols-[1fr_12rem]"><Input label="搜索学习记录" placeholder="搜索标题、原文或结果…" value={query} onChange={(event) => onQuery(event.target.value)} /><SelectField label="记录类型" value={type} onChange={(event) => onType(event.target.value ? historyTypeSchema.parse(event.target.value) : '')}><option value="">全部类型</option><option value="essay">作文批改</option><option value="sentence">长难句</option><option value="exam">真题解析</option><option value="chat">学习答疑</option></SelectField></div>; }
