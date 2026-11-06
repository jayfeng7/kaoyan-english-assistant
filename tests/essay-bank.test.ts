import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createEssayBank } from '@/lib/essay-bank';
import * as bank from '@/lib/essay-bank';
import * as client from '@/lib/llm/client';
import * as logger from '@/lib/utils/logger';
import { GET as list } from '@/app/api/essay/bank/route';
import { GET as detail } from '@/app/api/essay/bank/[id]/route';
import { POST as correct } from '@/app/api/essay/correct/route';
import { essayBankItemSchema } from '@/lib/schemas/essay-bank';
import { essayDataSchema } from '@/lib/schemas/storage';
import { makeEssayBankItem, makeEssayData, makeEssayResult } from './fixtures';

let root = ''; let sequence = 0;
const parent = path.resolve('.test-tmp');
beforeEach(async () => { await mkdir(parent, { recursive: true }); root = await mkdtemp(path.join(parent, 'essay-bank-')); await mkdir(path.join(root, 'english1')); vi.spyOn(logger, 'logRequest').mockImplementation(() => {}); });
afterEach(async () => { if (!path.resolve(root).startsWith(parent + path.sep)) throw new Error('Unsafe fixture path'); await rm(root, { recursive: true, force: true }); });
const item = makeEssayBankItem();
describe('writing bank and backward-compatible snapshots', () => {
  it('filters reviewed writing tasks and returns cloned details without traversing paths', async () => {
    await writeFile(path.join(root, 'english1/2019.json'), JSON.stringify([item, { ...item, id: 'english1-2019-small', composition: 'small', reviewed: false }]));
    const reader = createEssayBank(root);
    expect(await reader.list({ year: 2019, composition: 'small' })).toEqual({ items: [], total: 0 });
    const result = await reader.list({ type: 'english1', year: 2019 }); expect(result.total).toBe(1); expect(result.items[0]).not.toHaveProperty('directions');
    const copy = await reader.get(item.id); copy.directions = 'mutated'; expect((await reader.get(item.id)).directions).toBe(item.directions);
    await expect(reader.get('../../.env.local')).rejects.toMatchObject({ code: 'EXAM_BANK_NOT_FOUND' });
  });
  it('supports an empty bank and rejects malformed content without leaking it', async () => {
    expect((await createEssayBank(root).list()).total).toBe(0);
    await writeFile(path.join(root, 'english1/2019.json'), '{private content');
    await expect(createEssayBank(root).list()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
  it.each(['id', 'image', 'year', 'long', 'duplicate'])('rejects invalid %s data', async (kind) => {
    const bad = { ...item, ...(kind === 'id' ? { id: 'wrong' } : kind === 'image' ? { materialImage: '../private.png' } : kind === 'year' ? { year: 2020 } : kind === 'long' ? { directions: 'x'.repeat(501) } : {}) };
    await writeFile(path.join(root, 'english1/2019.json'), JSON.stringify(kind === 'duplicate' ? [item, item] : [bad]));
    await expect(createEssayBank(root).list()).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });
  it('validates picture description and preserves old/new history metadata', () => {
    expect(essayBankItemSchema.safeParse({ ...item, materialImage: '/essay-materials/test.jpg', materialDescription: '' }).success).toBe(false);
    const old = makeEssayData(); expect(essayDataSchema.parse(old)).toEqual(old);
    const snapshot = { ...old, source: 'bank', bankId: item.id, year: item.year, sourceLabel: item.title }; expect(essayDataSchema.parse(snapshot)).toEqual(snapshot);
  });
});
describe('writing endpoints', () => {
  it('validates query parameters and serves list/detail contracts', async () => {
    const listSpy = vi.spyOn(bank, 'listEssayBank').mockResolvedValue({ items: [item], total: 1 }); vi.spyOn(bank, 'getEssayBankItem').mockResolvedValue(item);
    expect((await list(new Request('http://local/api/essay/bank?year=2019&composition=big'))).status).toBe(200);
    expect(listSpy).toHaveBeenCalledWith({ year: 2019, composition: 'big' });
    expect((await detail(new Request('http://local'), { params: Promise.resolve({ id: item.id }) })).status).toBe(200);
    expect((await list(new Request('http://local/api/essay/bank?year=2005&type=english1'))).status).toBe(200);
    expect((await list(new Request('http://local/api/essay/bank?year=2016&type=english2'))).status).toBe(200);
    for (const query of ['year=', 'year=no', 'year=2004', 'year=2027', 'composition=other', 'type=other']) expect((await list(new Request('http://local/api/essay/bank?'+query))).status).toBe(400);
  });
  it('uses authoritative bank prompt, rejects mismatches and preserves missing-item errors', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-only'); vi.stubEnv('SILICONFLOW_API_KEY', ''); vi.stubEnv('OPENROUTER_API_KEY', '');
    const get = vi.spyOn(bank, 'getEssayBankItem').mockResolvedValue(item); const call = vi.spyOn(client, 'callProvider').mockResolvedValue(JSON.stringify(makeEssayResult()));
    const request = (extra: object = {}) => new Request('http://local/api/essay/correct', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `essay-new-${++sequence}` }, body: JSON.stringify({ type: item.type, composition: item.composition, source: 'bank', bankId: item.id, prompt: 'tampered', essay: 'Learning takes practice.', ...extra }) });
    expect((await correct(request())).status).toBe(200);
    const params = call.mock.calls[0]?.[1]; expect(params?.user).toContain(item.directions); expect(params?.user).not.toContain('tampered');
    expect((await correct(request({ composition: 'small' }))).status).toBe(400);
    get.mockRejectedValueOnce(new Error('private stack')); const response = await correct(request()); expect(response.status).toBe(500); expect(await response.text()).not.toContain('private');
  });
});
