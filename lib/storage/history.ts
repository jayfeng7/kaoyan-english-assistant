'use client';

import { appSettingsSchema, historyRecordSchema } from '@/lib/schemas/storage';
import { AppError } from '@/lib/utils/errors';
import { toPlainText } from '@/lib/utils/markdown';
import { clearStoredHistory, readAllHistory, readHistory, readSettings, removeHistory, writeHistory, writeSettings } from './db';
import type { AppSettings, HistoryFilter, HistoryRecord, HistoryType } from '@/types';

function textValues(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(textValues).join(' ');
  if (typeof value === 'object' && value !== null) return Object.values(value).map(textValues).join(' ');
  return '';
}

export function createHistoryRecord(type: HistoryType, data: HistoryRecord['data']): HistoryRecord {
  const source = 'essay' in data ? data.essay : 'sentence' in data ? data.sentence : 'passage' in data ? data.passage : data.messages[0]?.content ?? '';
  const plain = toPlainText(source);
  const record: HistoryRecord = { id: data.id, type, title: Array.from(plain).slice(0, 32).join(''), preview: Array.from(plain).slice(0, 80).join(''), createdAt: data.createdAt, updatedAt: 'updatedAt' in data ? data.updatedAt : Math.max(Date.now(), data.createdAt), data };
  const parsed = historyRecordSchema.safeParse(record);
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  return parsed.data;
}

export async function saveHistory(record: HistoryRecord): Promise<HistoryRecord> {
  const parsed = historyRecordSchema.safeParse({ ...record, preview: Array.from(toPlainText(record.preview)).slice(0, 80).join('') });
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  await writeHistory(parsed.data);
  return parsed.data;
}

export async function listHistory(filter: HistoryFilter = {}): Promise<HistoryRecord[]> {
  const query = filter.q?.trim().toLowerCase();
  return (await readAllHistory()).filter((record) => (!filter.type || record.type === filter.type) && (!query || `${record.title} ${record.preview} ${textValues(record.data)}`.toLowerCase().includes(query))).sort((a, b) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export const getHistory = readHistory;
export async function deleteHistory(id: string): Promise<void> { await removeHistory([id]); }
export const clearHistory = clearStoredHistory;
export const getSettings = readSettings;
export async function saveSettings(settings: AppSettings): Promise<void> {
  const parsed = appSettingsSchema.safeParse(settings);
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  await writeSettings(parsed.data);
}
