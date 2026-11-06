'use client';
import { useState } from 'react';
import { ProviderStatus } from './ProviderStatus';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace, applySettings } from '@/lib/client/workspace';
import { saveSettings } from '@/lib/storage/history';
import { useTask } from '@/lib/client/task';
import { compositionTypeSchema, examTypeSchema } from '@/lib/schemas/common';
import type { AppSettings } from '@/types';
export function SettingsForm() {
  const saved = useWorkspace((state) => state.settings); const ready = useWorkspace((state) => state.ready); const [changes, setChanges] = useState<Partial<AppSettings>>({}); const values = { ...saved, ...changes }; const task = useTask(); const { notify } = useToast();
  return <div className="space-y-5"><ProviderStatus /><Card><form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void task.run(async () => { await saveSettings(values); applySettings(values); setChanges({}); notify('设置已保存；默认题型将在新的练习中使用', 'success'); }); }}><div className="grid gap-5 sm:grid-cols-2"><SelectField label="默认考试类型" value={values.essayType} disabled={!ready || task.busy} onChange={(event) => setChanges({ ...changes, essayType: examTypeSchema.parse(event.target.value) })}><option value="english1">英语一</option><option value="english2">英语二</option></SelectField><SelectField label="默认作文类型" value={values.composition} disabled={!ready || task.busy} onChange={(event) => setChanges({ ...changes, composition: compositionTypeSchema.parse(event.target.value) })}><option value="big">大作文</option><option value="small">小作文</option></SelectField></div><SelectField label="结果阅读字号" value={values.fontSize} disabled={!ready || task.busy} onChange={(event) => setChanges({ ...changes, fontSize: Number(event.target.value) })}>{[...new Set([14, 16, 18, 20, 24, values.fontSize])].sort((a, b) => a - b).map((size) => <option key={size} value={size}>{size} px</option>)}</SelectField><label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" className="mt-2 h-4 w-4 accent-accent" checked={values.defaultFullTranslation} disabled={!ready || task.busy} onChange={(event) => setChanges({ ...changes, defaultFullTranslation: event.target.checked })} /><span>真题解析默认生成并展开全文翻译</span></label><Button type="submit" loading={task.busy} disabled={!ready}>保存设置</Button></form></Card><Card><h2 className="text-xl font-semibold">关于本地历史</h2><p className="mt-3 text-sm leading-7 text-muted">清除浏览器数据将删除全部历史，请先导出 JSON 备份。更换浏览器、设备或访问地址时，历史不会自动同步。</p><a className="mt-4 inline-block text-sm text-accent underline underline-offset-4" href="/history">前往历史记录导出备份</a></Card></div>;
}
