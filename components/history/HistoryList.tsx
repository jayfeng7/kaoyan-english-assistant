'use client';
import { useEffect, useState } from 'react';
import { HistoryFilter } from './HistoryFilter';
import { HistoryItem } from './HistoryItem';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { listHistory, deleteHistory, clearHistory, getSettings } from '@/lib/storage/history';
import { exportHistoryJson, importHistoryJson } from '@/lib/export/json';
import { downloadJson } from '@/lib/client/files';
import { applySettings, forgetDeletedHistory } from '@/lib/client/workspace';
import { useTask } from '@/lib/client/task';
import { messageFor } from '@/lib/client/api';
import type { HistoryRecord, HistoryType } from '@/types';
export function HistoryList() {
  const [items, setItems] = useState<HistoryRecord[]>([]); const [type, setType] = useState<HistoryType | ''>(''); const [query, setQuery] = useState(''); const [revision, setRevision] = useState(0); const [loadedKey, setLoadedKey] = useState(''); const [target, setTarget] = useState<HistoryRecord | 'all' | 'type'>(); const task = useTask(); const { notify } = useToast();
  const queryKey = JSON.stringify([type, query, revision]); const loading = loadedKey !== queryKey;
  useEffect(() => { let active = true; void listHistory({ type: type || undefined, q: query }).then((records) => { if (active) setItems(records); }).catch((error: unknown) => { if (active) notify(messageFor(error), 'error'); }).finally(() => { if (active) setLoadedKey(queryKey); }); return () => { active = false; }; }, [type, query, revision, notify, queryKey]);
  const refresh = () => setRevision((current) => current + 1);
  return <div className="space-y-6"><Card className="space-y-5"><HistoryFilter type={type} query={query} onType={setType} onQuery={setQuery} /><div className="flex flex-wrap gap-3"><Button variant="secondary" disabled={task.busy} onClick={() => { void task.run(async () => { downloadJson(await exportHistoryJson()); notify('备份已导出', 'success'); }); }}>导出全部记录</Button><label className={`inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line px-5 py-2.5 text-sm font-medium ${task.busy ? 'pointer-events-none opacity-50' : ''}`}>导入 JSON<input type="file" accept="application/json,.json" className="sr-only" disabled={task.busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; void task.run(async () => { const count = await importHistoryJson(await file.text()); applySettings(await getSettings()); refresh(); notify(`已导入 ${count} 条记录；相同 ID 的记录已覆盖`, 'success'); }); }} /></label>{type && <Button variant="ghost" disabled={task.busy || !items.length} onClick={() => setTarget('type')}>删除此类型全部记录</Button>}<Button variant="ghost" disabled={task.busy} onClick={() => setTarget('all')}>清空全部历史</Button></div><p className="text-xs leading-6 text-muted">备份包含原文、分析结果和设置，请妥善保管。导入按 ID 合并，相同 ID 会被覆盖。</p></Card><p role="status" className="text-sm text-muted">{loading ? '正在读取记录…' : `找到 ${items.length} 条记录`}</p><div className="grid gap-4 md:grid-cols-2">{items.map((record) => <HistoryItem key={record.id} record={record} onDelete={setTarget} />)}</div>{!loading && !items.length && <Card><h2 className="text-xl font-semibold">这里还没有匹配的记录</h2><p className="mt-3 text-sm text-muted">完成一次分析或开始一段对话后，记录会出现在这里。也可以调整搜索条件。</p></Card>}<Modal open={Boolean(target)} title="确认删除历史记录" onClose={() => { if (!task.busy) setTarget(undefined); }}><p className="text-sm leading-7">{typeof target === 'object' ? `将删除“${target.title}”。` : target === 'type' ? '将删除当前类型的全部记录，包括搜索结果之外的记录。' : '将删除此浏览器中的全部学习记录。'}删除后无法恢复，建议先导出备份。</p><div className="mt-6 flex flex-wrap gap-3"><Button variant="secondary" disabled={task.busy} onClick={() => setTarget(undefined)}>取消</Button><Button loading={task.busy} onClick={() => { void task.run(async () => { if (typeof target === 'object') await deleteHistory(target.id); else if (target === 'type' && type) await clearHistory(type); else if (target === 'all') await clearHistory(); forgetDeletedHistory(typeof target === 'object' ? { id: target.id } : target === 'type' && type ? { type } : {}); refresh(); setTarget(undefined); notify('记录已删除', 'success'); }); }}>确认删除</Button></div></Modal></div>;
}
