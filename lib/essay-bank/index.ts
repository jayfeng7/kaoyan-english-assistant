import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { essayBankFilterSchema, essayBankItemSchema } from '@/lib/schemas/essay-bank';
import { AppError } from '@/lib/utils/errors';
import type { EssayBankItem, EssayBankReader } from '@/types';

export function createEssayBank(root?: string): EssayBankReader {
  // Keep the production paths explicit: tracing a dynamic child of the parent
  // directory can package drafts/reviews, even when Windows exclusions miss.
  const directories = root === undefined ? {
    english1: path.join(process.cwd(), 'data', 'essay-bank', 'english1'),
    english2: path.join(process.cwd(), 'data', 'essay-bank', 'english2'),
  } : {
    english1: path.join(root, 'english1'), english2: path.join(root, 'english2'),
  };
  let cached: Promise<EssayBankItem[]> | undefined;
  async function load(): Promise<EssayBankItem[]> {
    cached ??= (async () => {
      const items: EssayBankItem[] = []; const ids = new Set<string>();
      for (const type of ['english1', 'english2'] as const) {
        let files: string[];
        try { files = await readdir(directories[type]); }
        catch (error) { if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') continue; throw error; }
        for (const file of files.filter((name) => /^20\d{2}\.json$/.test(name)).sort()) {
          const raw: unknown = JSON.parse(await readFile(path.join(directories[type], file), 'utf8'));
          for (const item of z.array(essayBankItemSchema).parse(raw)) {
            if (item.type !== type || file !== `${item.year}.json` || ids.has(item.id)) throw new AppError('INTERNAL_ERROR');
            ids.add(item.id); if (item.reviewed) items.push(item);
          }
        }
      }
      return items;
    })().catch(() => { cached = undefined; throw new AppError('INTERNAL_ERROR'); });
    return cached;
  }
  return {
    async list(filter = {}) {
      const parsed = essayBankFilterSchema.safeParse(filter);
      if (!parsed.success) throw new AppError('INVALID_INPUT');
      const { type, year, composition } = parsed.data;
      const items = (await load()).filter((item) => (!type || item.type === type) && (!composition || item.composition === composition) && (year === undefined || item.year === year)).sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
      return { items: items.map(({ id, type, composition, year, title }) => ({ id, type, composition, year, title })), total: items.length };
    },
    async get(id) {
      const item = (await load()).find((entry) => entry.id === id);
      if (!item) throw new AppError('EXAM_BANK_NOT_FOUND');
      return structuredClone(item);
    },
  };
}
const bank = createEssayBank();
export const listEssayBank = bank.list;
export const getEssayBankItem = bank.get;
