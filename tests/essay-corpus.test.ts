import { describe, expect, it } from 'vitest';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { essayBankItemSchema } from '@/lib/schemas/essay-bank';
import { createEssayBank } from '@/lib/essay-bank';
import { createHash } from 'node:crypto';

const corpusAvailable = [
  'data/essay-bank/drafts',
  'data/essay-bank/reviews',
  'data/essay-bank/english1',
  'data/essay-bank/english2',
  'public/essay-materials',
].every((directory) => existsSync(path.join(process.cwd(), directory)));

if (process.env.REQUIRE_FULL_CORPUS === '1' && !corpusAvailable) {
  throw new Error('REQUIRE_FULL_CORPUS=1 but the local writing corpus is unavailable.');
}

// The clean open-source release deliberately excludes third-party examination content.
// Set REQUIRE_FULL_CORPUS=1 when validating a private deployment that includes it.
describe.skipIf(!corpusAvailable)('writing source corpus integrity', () => {
  it('contains exactly forty unique in-scope tasks, valid prompt lengths and source image files', async () => {
    const directory = path.join(process.cwd(), 'data/essay-bank/drafts');
    const files = (await readdir(directory)).filter((file) => file.endsWith('.json')); expect(files.length).toBe(40);
    const ids = new Set<string>();
    for (const file of files) {
      const raw: unknown = JSON.parse(await readFile(path.join(directory, file), 'utf8')); const parsed = essayBankItemSchema.safeParse(raw);
      expect(parsed.success, file).toBe(true); if (!parsed.success) continue;
      const item = parsed.data; expect(ids.has(item.id), file).toBe(false); ids.add(item.id);
      if (item.materialImage) expect((await stat(path.join(directory, `${item.id}.jpg`))).size, file).toBeGreaterThan(0);
    }
    for (const type of ['english1','english2']) for (let year = 2017; year <= 2026; year++) for (const composition of ['big','small']) expect(ids.has(`${type}-${year}-${composition}`)).toBe(true);
  });
  it('only exposes reviewed tasks and published material assets', async () => {
    const reader = createEssayBank(); const list = await reader.list(); expect(list.total).toBeGreaterThan(0);
    for (const entry of list.items) { const item = await reader.get(entry.id); expect(item.reviewed).toBe(true); if (item.materialImage) expect((await stat(path.join(process.cwd(), 'public', item.materialImage))).size).toBeGreaterThan(0); }
  });
  it('covers every supplied paper with two writing tasks, keeping undivided papers out of English II', async () => {
    const reader = createEssayBank(); expect((await reader.list()).total).toBe(78);
    for (const type of ['english1', 'english2'] as const) {
      const start = type === 'english1' ? 2005 : 2010;
      const years = Array.from({ length: 2026 - start + 1 }, (_, index) => 2026 - index);
      for (const composition of ['big', 'small'] as const) {
        const list = await reader.list({ type, composition }); expect(list.total).toBe(years.length);
        expect(list.items.map((item) => item.year)).toEqual(years);
      }
      for (let year = start; year <= 2026; year++) expect((await reader.list({ type, year })).items.map((item) => item.composition).sort()).toEqual(['big', 'small']);
    }
    for (let year = 2005; year < 2010; year++) {
      expect((await reader.list({ type: 'english2', year })).total).toBe(0);
      for (const entry of (await reader.list({ type: 'english1', year })).items) expect(entry.title).toContain('早期旧卷');
    }
  });
  it('rejects invented pre-2010 English II tasks and retains reviewed early-paper requirements', async () => {
    const reader = createEssayBank(); const old = await reader.get('english1-2005-small');
    expect(old.directions).toContain('no less than 100 words'); expect(old.directions).toContain('Mr. Wang');
    expect(essayBankItemSchema.safeParse({ ...old, type: 'english2', id: 'english2-2005-small' }).success).toBe(false);
    expect((await reader.get('english2-2010-small')).directions).toContain('Zhang Wei');
    expect((await reader.get('english2-2014-small')).directions).toContain('about 100 words');
    expect((await reader.get('english2-2012-big')).materialDescription).toContain('41–50岁为0.0／36.0／64.0');
    expect((await reader.get('english2-2011-big')).materialDescription).toContain('不估读');
    expect((await reader.get('english1-2016-big')).directions).toContain('1) describe');
  });
  it('preserves image provenance and rejects replacement-character corruption throughout the published corpus', async () => {
    const reader = createEssayBank();
    const manifest: unknown = JSON.parse(await readFile('data/essay-bank/reviews/extension-20261020.json', 'utf8'));
    expect(manifest).toMatchObject({ count: 38 });
    if (typeof manifest !== 'object' || !manifest || !('items' in manifest) || !Array.isArray(manifest.items)) throw new Error('Missing review manifest');
    const seen = new Set<string>();
    for (const row of manifest.items as unknown[]) {
      if (typeof row !== 'object' || !row || !('id' in row) || typeof row.id !== 'string' || !('imageSha256' in row)) throw new Error('Invalid review entry');
      expect(seen.has(row.id)).toBe(false); seen.add(row.id);
      const detail = await reader.get(row.id);
      if (detail.materialImage) expect(createHash('sha256').update(await readFile(path.join('public', detail.materialImage))).digest('hex')).toBe(row.imageSha256);
      else expect(row.imageSha256).toBeNull();
    }
    expect(seen.size).toBe(38);
    for (const item of (await reader.list()).items) expect(JSON.stringify(await reader.get(item.id))).not.toContain('\ufffd');
  });
  it('keeps the user-approved 2019 sample and its image unchanged', async () => {
    const reader = createEssayBank(); const draft: unknown = JSON.parse(await readFile('data/essay-bank/drafts/english1-2019-big.json','utf8'));
    expect(await reader.get('english1-2019-big')).toEqual(essayBankItemSchema.parse(draft));
    const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
    expect(hash(await readFile('public/essay-materials/english1-2019-big.jpg'))).toBe(hash(await readFile('data/essay-bank/drafts/english1-2019-big.jpg')));
  });
  it('publishes corrected writing instructions without mutating source snapshots', async () => {
    const reader = createEssayBank();
    expect((await reader.get('english1-2017-small')).directions).toContain('about 100 words');
    const notice = await reader.get('english1-2020-small'); expect(notice.directions).toContain('Write a notice'); expect(notice.directions).not.toContain('White a notice');
    expect(await readFile('data/essay-bank/drafts/english1-2020-small.json','utf8')).toContain('White a notice');
    expect((await reader.get('english2-2020-small')).directions).toContain('about 100 words');
    const meeting = await reader.get('english2-2021-small'); expect(meeting.directions.match(/Do not use your own name/g)).toHaveLength(1); expect(meeting.directions.match(/10 points/g)).toHaveLength(1); expect(meeting.directions).toContain('Jack');
    const museum = await reader.get('english2-2017-big'); expect(museum.materialDescription).toContain('两项均逐年增加'); expect(museum.materialDescription).not.toMatch(/4692|4695|4697|6378|7811/);
    for (const item of (await reader.list()).items) {
      const detail = await reader.get(item.id);
      if (item.composition === 'big' && item.type === 'english1') expect(detail.directions).toMatch(/160\s*[-–]\s*200 words/);
      else expect(detail.directions).toContain(item.composition === 'small' ? '100 words' : '150 words');
      expect(detail.directions).toContain(item.composition === 'small' ? '10 points' : item.type === 'english1' ? '20 points' : '15 points');
    }
  });
});
