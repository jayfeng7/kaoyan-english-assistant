import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeChatData, makeEssayData, makeExamData, makeHistory, makeSentenceData, TEST_ID, TEST_ID_2 } from './fixtures';

let closeCurrent = async () => {};
beforeEach(() => { vi.resetModules(); vi.stubGlobal('indexedDB', new IDBFactory()); });
afterEach(async () => { await closeCurrent(); });

async function session() {
  const db = await import('@/lib/storage/db');
  const history = await import('@/lib/storage/history');
  const backup = await import('@/lib/export/json');
  const status = await import('@/lib/storage/status');
  closeCurrent = async () => { (await db.initializeStorage())?.close(); };
  return { db, history, backup, status };
}

describe('browser IndexedDB history and backup lifecycle', () => {
  it('creates exactly the specified stores, indexes, version and fixed settings key', async () => {
    const { db, history, status } = await session();
    const connection = await db.initializeStorage();
    expect(connection?.name).toBe('kaoyan-english-assistant'); expect(connection?.version).toBe(1);
    expect(Array.from(connection!.objectStoreNames).sort()).toEqual(['history', 'settings']);
    const tx = connection!.transaction('history');
    expect(Array.from(tx.store.indexNames).sort()).toEqual(['createdAt', 'type']); await tx.done;
    expect(status.useStorageStatus.getState().mode).toBe('persistent');
    expect(await history.getSettings()).toEqual(db.DEFAULT_SETTINGS);
    await history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: 18, composition: 'small', essayType: 'english2' });
    expect(await connection?.get('settings', 'app')).toMatchObject({ id: 'app', fontSize: 18, composition: 'small', essayType: 'english2' });
    expect(await history.getSettings()).not.toHaveProperty('id');
  });
  it('creates all four history kinds and retains complete results, suppliers and follow-ups', async () => {
    const { history } = await session();
    const records = [history.createHistoryRecord('essay', makeEssayData()), history.createHistoryRecord('sentence', makeSentenceData()), history.createHistoryRecord('exam', makeExamData()), history.createHistoryRecord('chat', makeChatData())];
    for (const record of records) await history.saveHistory(record);
    expect(await history.listHistory()).toHaveLength(4);
    expect((await history.getHistory(TEST_ID))?.data).toEqual(makeEssayData());
    expect(await history.listHistory({ q: '让步从句' })).toMatchObject([{ type: 'sentence' }]);
    expect(await history.listHistory({ q: 'LEARNING', type: 'essay' })).toHaveLength(1);
    expect(await history.listHistory({ q: '让步从句', type: 'essay' })).toHaveLength(0);
  });
  it('updates by id, searches embedded results and returns independent snapshots', async () => {
    const { history } = await session();
    const record = makeHistory(); await history.saveHistory(record);
    record.title = 'Changed in caller';
    expect((await history.getHistory(TEST_ID))?.title).toBe('Practice');
    const updated = makeHistory(); updated.title = 'Updated'; updated.updatedAt = 102;
    await history.saveHistory(updated);
    expect(await history.listHistory()).toHaveLength(1);
    expect((await history.listHistory({ q: '可补充例子' }))[0]?.title).toBe('Updated');
    const returned = (await history.getHistory(TEST_ID))!; returned.title = 'Changed after read';
    expect((await history.getHistory(TEST_ID))?.title).toBe('Updated');
  });
  it('deletes one record, by type, and all records without clearing settings', async () => {
    const { history, db } = await session();
    await history.saveHistory(makeHistory());
    await history.saveHistory(history.createHistoryRecord('sentence', makeSentenceData()));
    await history.saveHistory(history.createHistoryRecord('exam', makeExamData()));
    await history.deleteHistory(TEST_ID);
    expect(await history.getHistory(TEST_ID)).toBeUndefined();
    await history.clearHistory('sentence');
    expect((await history.listHistory()).map((record) => record.type)).toEqual(['exam']);
    await history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: 19 });
    await history.clearHistory();
    expect(await history.listHistory()).toEqual([]);
    expect((await history.getSettings()).fontSize).toBe(19);
  });
  it('exports/imports full snapshots and settings, with imported ids overwriting conflicts', async () => {
    const { history, db, backup } = await session();
    const original = makeHistory(); await history.saveHistory(original);
    const sentence = history.createHistoryRecord('sentence', makeSentenceData());
    await history.saveHistory(sentence);
    await history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: 20 });
    const exported = await backup.exportHistoryJson();
    await history.clearHistory(); await history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: 16 });
    expect(await backup.importHistoryJson(exported)).toBe(2);
    expect((await history.getHistory(TEST_ID))?.data).toEqual(original.data);
    expect((await history.getSettings()).fontSize).toBe(20);
    const replacement = { ...original, title: 'Imported replacement' };
    await backup.importHistoryJson(JSON.stringify({ history: [replacement], settings: db.DEFAULT_SETTINGS }));
    expect((await history.getHistory(TEST_ID))?.title).toBe('Imported replacement');
    expect(await history.getHistory(TEST_ID_2)).toEqual(sentence);
  });
  it('validates the entire import before writing and rejects wrong nested result types', async () => {
    const { history, db, backup } = await session();
    const original = makeHistory(); await history.saveHistory(original);
    const changed = { ...original, title: 'Must not be written' };
    const invalid = history.createHistoryRecord('sentence', makeSentenceData());
    const malformed = { ...invalid, data: { ...invalid.data, result: { translation: 'incomplete' } } };
    await expect(backup.importHistoryJson(JSON.stringify({ history: [changed, malformed], settings: db.DEFAULT_SETTINGS }))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await history.getHistory(TEST_ID)).toEqual(original);
    expect(await history.getHistory(TEST_ID_2)).toBeUndefined();
    await expect(backup.importHistoryJson('{invalid')).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: -1 })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('caps a plain-text preview at 80 Unicode characters', async () => {
    const { history } = await session();
    const data = { ...makeSentenceData(), sentence: '字🙂'.repeat(50) };
    const record = history.createHistoryRecord('sentence', data);
    expect(Array.from(record.preview)).toHaveLength(80);
    await history.saveHistory(record);
    expect((await history.getHistory(data.id))?.preview).toBe(record.preview);
  });
});

describe('recoverable in-memory storage mode', () => {
  it('keeps history/settings/export/import functional when IndexedDB is missing', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const { db, history, backup, status } = await session();
    await history.saveHistory(makeHistory());
    expect(status.useStorageStatus.getState().mode).toBe('memory');
    expect(await db.initializeStorage()).toBeNull();
    await history.saveSettings({ ...db.DEFAULT_SETTINGS, fontSize: 21 });
    const text = await backup.exportHistoryJson();
    await history.clearHistory();
    expect(await history.listHistory()).toEqual([]);
    await backup.importHistoryJson(text);
    expect((await history.getHistory(TEST_ID))?.data).toEqual(makeEssayData());
    expect((await history.getSettings()).fontSize).toBe(21);
    const copy = (await history.getHistory(TEST_ID))!; copy.title = 'External mutation';
    expect((await history.getHistory(TEST_ID))?.title).toBe('Practice');
  });
  it('recovers when the browser rejects opening IndexedDB', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    const { history, status } = await session();
    await history.saveHistory(makeHistory());
    expect(status.useStorageStatus.getState().mode).toBe('memory');
    expect(await history.listHistory()).toHaveLength(1);
  });
  it('preserves the session mirror when a later database transaction fails', async () => {
    const { db, history, status } = await session();
    await history.saveHistory(makeHistory());
    const connection = await db.initializeStorage();
    const nativePrototype = Object.getPrototypeOf(connection!);
    vi.spyOn(nativePrototype, 'transaction').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    const sentence = history.createHistoryRecord('sentence', makeSentenceData());
    await history.saveHistory(sentence);
    expect(status.useStorageStatus.getState().mode).toBe('memory');
    expect(await history.listHistory()).toHaveLength(2);
    expect((await history.getHistory(TEST_ID))?.data).toEqual(makeEssayData());
    await history.deleteHistory(TEST_ID_2);
    expect(await history.listHistory()).toHaveLength(1);
  });
});
