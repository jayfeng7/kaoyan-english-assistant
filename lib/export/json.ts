'use client';

import { backupDataSchema } from '@/lib/schemas/storage';
import { readAllHistory, readSettings, mergeStoredBackup } from '@/lib/storage/db';
import { AppError } from '@/lib/utils/errors';
import type { BackupData } from '@/types';

export async function exportHistoryJson(): Promise<string> {
  const [history, settings] = await Promise.all([readAllHistory(), readSettings()]);
  const backup: BackupData = { history, settings };
  return JSON.stringify(backupDataSchema.parse(backup), null, 2);
}

export async function importHistoryJson(text: string): Promise<number> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new AppError('INVALID_INPUT'); }
  const parsed = backupDataSchema.safeParse(value);
  if (!parsed.success) throw new AppError('INVALID_INPUT');
  await mergeStoredBackup(parsed.data);
  return parsed.data.history.length;
}
