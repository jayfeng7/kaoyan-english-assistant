'use client';
import { useEffect } from 'react';
import { getSettings } from '@/lib/storage/history';
import { useStorageStatus } from '@/lib/storage/status';
import { useWorkspace, applySettings } from '@/lib/client/workspace';
import type { ChildrenProps } from '@/types';

export function ClientProvider({ children }: ChildrenProps) {
  const mode = useStorageStatus((state) => state.mode); const fontSize = useWorkspace((state) => state.settings.fontSize);
  useEffect(() => { let active = true; void getSettings().then((settings) => { if (!active) return; applySettings(settings); useWorkspace.setState({ ready: true }); }); return () => { active = false; }; }, []);
  useEffect(() => { document.documentElement.style.setProperty('--reading-size', `${Math.max(12, Math.min(32, fontSize))}px`); }, [fontSize]);
  return <>{mode === 'memory' && <div data-print-hidden role="alert" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm text-amber-900">本地存储不可用，历史将不会保存。当前会话仍可使用，请及时导出备份。</div>}{children}</>;
}
