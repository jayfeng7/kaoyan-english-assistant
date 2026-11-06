import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createExamBank } from '@/lib/exam-bank';
import { makeBankItem } from './fixtures';

let root = '';
const parent = path.resolve(process.cwd(), '.test-tmp');
beforeEach(async () => {
  await mkdir(parent, { recursive: true });
  root = await mkdtemp(path.join(parent, 'bank-'));
  await mkdir(path.join(root, 'english1')); await mkdir(path.join(root, 'english2'));
});
afterEach(async () => {
  const resolved = path.resolve(root);
  if (!resolved.startsWith(parent + path.sep)) throw new Error('Refusing to remove a directory outside the test fixture root.');
  await rm(resolved, { recursive: true, force: true });
});

describe('read-only structured exam bank', () => {
  it('returns empty metadata and a typed missing-item error before Phase 3 data exists', async () => {
    const bank = createExamBank(root);
    expect(await bank.getBankList()).toEqual({ items: [], total: 0 });
    expect(await bank.getBankCount()).toBe(0);
    await expect(bank.getBankItem('absent')).rejects.toMatchObject({ code: 'EXAM_BANK_NOT_FOUND' });
  });
  it('filters by type/year/title and never includes passage/questions in list metadata', async () => {
    const first = makeBankItem();
    await writeFile(path.join(root, 'english1', '2025.json'), JSON.stringify([first, { ...first, id: 'english1-2024-text1', year: 2024, title: 'Other title' }]));
    await writeFile(path.join(root, 'english2', '2025.json'), JSON.stringify([{ ...first, id: 'english2-2025-text1', type: 'english2' }]));
    const bank = createExamBank(root);
    expect(await bank.getBankCount()).toBe(3);
    const list = await bank.getBankList({ type: 'english1', year: 2025, q: 'PRACTICE' });
    expect(list.total).toBe(1); expect(list.items[0]).not.toHaveProperty('passage'); expect(list.items[0]).not.toHaveProperty('questions');
    expect(await bank.getBankList({ q: 'never real exam data' })).toEqual({ items: [], total: 0 });
    expect(await bank.getBankItem(first.id)).toEqual(first);
    const returned = await bank.getBankItem(first.id); returned.passage = 'mutated';
    expect((await bank.getBankItem(first.id)).passage).toBe(first.passage);
    await expect(bank.getBankItem('../../.env.local')).rejects.toMatchObject({ code: 'EXAM_BANK_NOT_FOUND' });
  });
  it.each(['invalid-json', 'invalid-fields', 'duplicate-id', 'wrong-directory'])('fails safely for %s instead of trusting invalid data', async (kind) => {
    const item = makeBankItem();
    const content = kind === 'invalid-json' ? '{private malformed text' : kind === 'invalid-fields' ? JSON.stringify([{ id: 'incomplete' }]) : kind === 'duplicate-id' ? JSON.stringify([item, item]) : JSON.stringify([{ ...item, type: 'english2' }]);
    await writeFile(path.join(root, 'english1', '2025.json'), content);
    await expect(createExamBank(root).getBankCount()).rejects.toMatchObject({ code: 'INTERNAL_ERROR', message: '服务暂时出现问题，请稍后重试' });
  });
});
