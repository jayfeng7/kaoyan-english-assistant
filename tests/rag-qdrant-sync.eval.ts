import { expect, it } from 'vitest';
import { syncEssayQdrant } from '@/lib/rag/qdrant';

it('publishes the versioned essay index to Qdrant', async () => {
  const result = await syncEssayQdrant();
  expect(result.points).toBeGreaterThan(0);
  process.stdout.write(JSON.stringify(result) + '\n');
});
