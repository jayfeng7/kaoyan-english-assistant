import 'server-only';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { examBankFilterSchema, examBankItemSchema } from '@/lib/schemas/exam';
import { AppError } from '@/lib/utils/errors';
import type { ExamBankFilter, ExamBankItem, ExamBankReader } from '@/types';

// A year file contains an array of ExamBankItem, consistently across both types.
export function createExamBank(root = path.join(process.cwd(), 'data', 'exams')): ExamBankReader {
  let cached: Promise<ExamBankItem[]> | undefined;
  async function load(): Promise<ExamBankItem[]> {
    cached ??= (async () => {
      const all: ExamBankItem[] = []; const ids = new Set<string>();
      for (const type of ['english1', 'english2'] as const) {
        const directory = path.join(root, type);
        let files: string[];
        try { files = await readdir(directory); }
        catch (error) {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') continue;
          throw new AppError('INTERNAL_ERROR');
        }
        for (const file of files.filter((name) => name.endsWith('.json')).sort()) {
          const raw: unknown = JSON.parse(await readFile(path.join(directory, file), 'utf8'));
          for (const item of z.array(examBankItemSchema).parse(raw)) {
            if (item.type !== type || ids.has(item.id)) throw new AppError('INTERNAL_ERROR');
            ids.add(item.id); all.push(item);
          }
        }
      }
      return all;
    })().catch(() => { cached = undefined; throw new AppError('INTERNAL_ERROR'); });
    return cached;
  }
  return {
    async getBankList(filter: ExamBankFilter = {}) {
      const parsed = examBankFilterSchema.safeParse(filter);
      if (!parsed.success) throw new AppError('INVALID_INPUT');
      const { type, year, q } = parsed.data;
      const query = q?.trim().toLowerCase();
      const matching = (await load()).filter((item) => (!type || item.type === type) && (year === undefined || item.year === year) && (!query || (item.title ?? '').toLowerCase().includes(query))).sort((a, b) => b.year - a.year || a.type.localeCompare(b.type) || a.section.localeCompare(b.section));
      return { items: matching.map(({ id, type: itemType, year: itemYear, section, title }) => ({ id, type: itemType, year: itemYear, section, ...(title !== undefined ? { title } : {}) })), total: matching.length };
    },
    async getBankItem(id: string) {
      const item = (await load()).find((entry) => entry.id === id);
      if (!item) throw new AppError('EXAM_BANK_NOT_FOUND');
      return structuredClone(item);
    },
    async getBankCount() { return (await load()).length; },
  };
}

const bank = createExamBank();
export const getBankList = bank.getBankList;
export const getBankItem = bank.getBankItem;
export const getBankCount = bank.getBankCount;
