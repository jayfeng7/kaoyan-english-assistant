import { expect, it } from 'vitest';
import { buildVectorIndex } from '@/lib/rag/vector-index';

it('builds the essay knowledge index using the local embedding model', async () => {
  const manifest = await buildVectorIndex();
  expect(manifest.cards).toBeGreaterThan(0);
  process.stdout.write(JSON.stringify(manifest) + '\n');
});
