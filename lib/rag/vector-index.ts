import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { embed, embeddingFormat, embeddingModel, modelDigest } from './embed';
import cards from './cards.json';

const dimension = 1024;
export const corpusHash = createHash('sha256').update(JSON.stringify(cards)).digest('hex');
const indexSchema = z.object({
  format: z.literal(embeddingFormat),
  model: z.literal(embeddingModel),
  digest: z.string().regex(/^[a-f0-9]{64}$/u),
  corpusHash: z.literal(corpusHash),
  dimension: z.literal(dimension),
  distance: z.literal('cosine'),
  vectors: z.array(z.object({
    id: z.string(),
    vector: z.array(z.number().finite()).length(dimension)
      .refine((vector) => Math.abs(Math.hypot(...vector) - 1) < 0.00001),
  })).length(cards.length).refine((rows) => rows.every((row, i) => row.id === cards[i]?.id)),
});
type VectorIndex = z.infer<typeof indexSchema>;

function indexPath() {
  return resolve(process.env.RAG_INDEX_PATH ?? 'artifacts/rag-index.json');
}

let cached: { path: string; index: Promise<VectorIndex> } | undefined;

export async function loadVectorIndex() {
  const path = indexPath();
  if (cached?.path === path) return cached.index;
  const index = readFile(path, 'utf8').then((data) => indexSchema.parse(JSON.parse(data)));
  cached = { path, index };
  try { return await index; } catch (error) {
    if (cached?.index === index) cached = undefined;
    throw error;
  }
}

export async function buildVectorIndex() {
  const path = indexPath();
  const signal = AbortSignal.timeout(120_000);
  const digest = await modelDigest(signal);
  const documents = cards.map(({ title, text, appliesWhen, example }) => [title, text, appliesWhen, example].join('\n'));
  const vectors: number[][] = [];
  for (let start = 0; start < documents.length; start += 8) {
    vectors.push(...await embed(documents.slice(start, start + 8), 'document', signal));
  }
  if (digest !== await modelDigest(signal)) throw new Error('Model changed while building the index');
  const index = indexSchema.parse({
    format: embeddingFormat, model: embeddingModel, digest, corpusHash, dimension, distance: 'cosine',
    vectors: cards.map(({ id }, i) => ({ id, vector: vectors[i] })),
  });
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(index) + '\n', { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
  cached = undefined;
  return { path, model: index.model, digest, corpusHash, dimension, cards: cards.length };
}
