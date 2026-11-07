import 'server-only';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import cards from './cards.json';
import { embeddingFormat, embeddingModel } from './embed';
import { corpusHash, loadVectorIndex } from './vector-index';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type DenseBackend = 'json' | 'qdrant-exact' | 'qdrant-hnsw';

export async function qdrantRequest(path: string, method: Method, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const base = new URL(process.env.RAG_QDRANT_URL ?? 'http://127.0.0.1:6333');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid Qdrant URL');
  const key = process.env.RAG_QDRANT_API_KEY;
  const response = await fetch(new URL(path, base), {
    method, signal, cache: 'no-store', redirect: 'error',
    headers: { ...(key ? { 'api-key': key } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Qdrant request failed (HTTP ${response.status})`);
  return response.json();
}

function collectionName(digest: string) {
  const version = createHash('sha256').update(JSON.stringify([embeddingFormat, embeddingModel, digest, corpusHash])).digest('hex');
  return `essay_rag_${version}`;
}

const existsSchema = z.object({ result: z.object({ exists: z.boolean() }) });
const countSchema = z.object({ result: z.object({ count: z.number().int().nonnegative() }) });
const pointsSchema = z.object({ result: z.object({
  points: z.array(z.object({ id: z.number().int().nonnegative(), score: z.number().finite() })),
}), time: z.number().nonnegative() });

export async function syncEssayQdrant() {
  const index = await loadVectorIndex();
  const collection = collectionName(index.digest);
  const endpoint = `/collections/${collection}`;
  const signal = AbortSignal.timeout(45_000);
  const exists = async () => existsSchema.parse(await qdrantRequest(`${endpoint}/exists`, 'GET', signal)).result.exists;
  if (!await exists()) {
    try {
      await qdrantRequest(endpoint, 'PUT', signal, {
        vectors: { size: index.dimension, distance: 'Cosine' },
      });
    } catch (error) {
      // A concurrent sync can create the same version first.
      if (!await exists()) throw error;
    }
  }
  await qdrantRequest(`${endpoint}/points?wait=true`, 'PUT', signal, {
    points: index.vectors.map(({ vector }, id) => ({ id, vector })),
  });
  const { result } = countSchema.parse(await qdrantRequest(`${endpoint}/points/count`, 'POST', signal, { exact: true }));
  if (result.count !== index.vectors.length) throw new Error('Qdrant collection point count does not match the local index');
  return { collection, points: result.count, dimension: index.dimension };
}

export async function queryQdrant(collection: string, body: object, signal: AbortSignal) {
  const response = await qdrantRequest(`/collections/${collection}/points/query`, 'POST', signal, body);
  const { result, time } = pointsSchema.parse(response);
  return { points: result.points, serverMs: time * 1000 };
}

export async function searchEssayQdrant(
  digest: string, query: number[], allowedIds: Set<string>, limit: number,
  backend: Exclude<DenseBackend, 'json'>, signal: AbortSignal,
) {
  const pointIds = cards.flatMap(({ id }, position) => allowedIds.has(id) ? [position] : []);
  if (!pointIds.length) return [];
  const ef = Number(process.env.RAG_QDRANT_HNSW_EF ?? 64);
  const { points } = await queryQdrant(collectionName(digest), {
    query, limit, with_payload: false, with_vector: false,
    params: backend === 'qdrant-exact' ? { exact: true } : { exact: false, hnsw_ef: Number.isSafeInteger(ef) && ef >= 1 ? ef : 64 },
    filter: { must: [{ has_id: pointIds }] },
  }, signal);
  const allowed = new Set(pointIds);
  if (points.length !== Math.min(pointIds.length, limit) || new Set(points.map(({ id }) => id)).size !== points.length ||
    points.some(({ id }) => !allowed.has(id))) {
    throw new Error('Qdrant returned an incomplete or out-of-scope result');
  }
  return points.map(({ id, score }) => ({ id: cards[id]!.id, score }));
}
