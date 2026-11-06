import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

it('ships the unchanged matching PDF worker with its license instead of relying on a third-party CDN', async () => {
  const shipped = await readFile('public/pdf-worker/2.4.5/pdf.worker.mjs');
  const installed = await readFile('node_modules/pdf-parse/dist/worker/pdf.worker.mjs');
  expect(shipped.equals(installed)).toBe(true);
  expect(createHash('sha256').update(shipped).digest('hex')).toBe('90b49a1bf7b6c4d689d7d7bc0a52869bb3b1bc5935a0fa0ea6413b49f85ac8de');
  expect(await readFile('public/pdf-worker/2.4.5/LICENSE', 'utf8')).toContain('Apache License');
});
