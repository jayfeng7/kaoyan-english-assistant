import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { qdrantRequest, queryQdrant } from '@/lib/rag/qdrant';
import { mean, percentile } from './rag-eval-fixtures';

const seed = 20261106;
const querySeed = 20261107;
const dimension = 128;
const queryCount = 64;
const k = 10;
const hnsw = { m: 16, ef_construct: 100, full_scan_threshold: 10 };
const infoSchema = z.object({ result: z.object({ indexed_vectors_count: z.number(), status: z.string() }) });
const versionSchema = z.object({ version: z.string() });
type QueryRun = { name: string; ids: number[]; ms: number; serverMs: number };
type QueryRow = { query: number; runs: Array<QueryRun & { recallAt10: number }> };

function vectorGenerator(initialSeed: number) {
  let state = initialSeed;
  return () => {
    const vector = Array.from({ length: dimension }, () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000 * 2 - 1;
    });
    const norm = Math.hypot(...vector);
    return vector.map((value) => value / norm);
  };
}

it('compares exact cosine and indexed HNSW on identical synthetic queries', async () => {
  const size = z.coerce.number().int().min(1000).max(100_000).parse(process.env.RAG_BENCH_POINTS ?? 20_000);
  const collection = `essay_bench_${randomUUID().replaceAll('-', '')}`;
  const path = `/collections/${collection}`;
  const request = (suffix: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', body?: unknown) =>
    qdrantRequest(`${path}${suffix}`, method, AbortSignal.timeout(20_000), body);
  const { version } = versionSchema.parse(await qdrantRequest('/', 'GET', AbortSignal.timeout(5000)));
  const nextVector = vectorGenerator(seed);
  const configurations = [
    { name: 'qdrant-exact', params: { exact: true } },
    ...[16, 64, 128, 256, 512].map((ef) => ({ name: `hnsw-ef-${ef}`, params: { exact: false, hnsw_ef: ef } })),
  ];
  const query = (vector: number[], params: object) =>
    queryQdrant(collection, { query: vector, params, limit: k, with_payload: false, with_vector: false }, AbortSignal.timeout(10_000));

  await request('', 'PUT', {
    vectors: { size: dimension, distance: 'Cosine' },
    hnsw_config: hnsw,
    optimizers_config: { indexing_threshold: 0, default_segment_number: 1 },
  });
  try {
    const buildStart = performance.now();
    for (let i = 0; i < size; i += 512) {
      const points = Array.from({ length: Math.min(512, size - i) }, (_, offset) => ({ id: i + offset, vector: nextVector() }));
      await request('/points?wait=true', 'PUT', { points });
    }
    await request('', 'PATCH', { optimizers_config: { indexing_threshold: 1 } });
    const readyBy = performance.now() + 120_000;
    let info = infoSchema.parse(await request('', 'GET')).result;
    while ((info.status !== 'green' || info.indexed_vectors_count < size) && performance.now() < readyBy) {
      await delay(500);
      info = infoSchema.parse(await request('', 'GET')).result;
    }
    expect(info.status).toBe('green');
    expect(info.indexed_vectors_count).toBe(size);
    const ingestAndIndexMs = performance.now() - buildStart;
    const nextQuery = vectorGenerator(querySeed);
    const queries = Array.from({ length: queryCount }, nextQuery);
    for (const { params } of configurations) await query(queries[0]!, params);

    const rows: QueryRow[] = [];
    for (const [index, vector] of queries.entries()) {
      const runs: QueryRun[] = [];
      // Rotate the order to reduce timing bias between configurations.
      for (let i = 0; i < configurations.length; i++) {
        const { name, params } = configurations[(index + i) % configurations.length]!;
        const start = performance.now();
        const { points, serverMs } = await query(vector, params);
        const ms = performance.now() - start;
        const ids = points.map(({ id }) => id);
        expect(new Set(ids).size).toBe(k);
        runs.push({ name, ids, ms, serverMs });
      }
      const truth = new Set(runs.find(({ name }) => name === 'qdrant-exact')!.ids);
      rows.push({ query: index, runs: runs.map((run) => ({ ...run, recallAt10: run.ids.filter((id) => truth.has(id)).length / k })) });
    }
    const summary = configurations.map(({ name }) => {
      const runs = rows.flatMap((row) => row.runs.filter((run) => run.name === name));
      const latency = runs.map(({ ms }) => ms);
      return { name, recallAt10: mean(runs.map(({ recallAt10 }) => recallAt10)),
        p50Ms: percentile(latency, 0.5), p95Ms: percentile(latency, 0.95),
        serverP95Ms: percentile(runs.map(({ serverMs }) => serverMs), 0.95) };
    });
    await mkdir('artifacts', { recursive: true });
    const report = { version, size, seed, querySeed, dimension, queryCount, k, hnsw, indexedVectors: info.indexed_vectors_count, ingestAndIndexMs, summary, rows };
    await writeFile(`artifacts/rag-qdrant-bench-${size}.json`, JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify({ size, indexedVectors: info.indexed_vectors_count, ingestAndIndexMs, summary }) + '\n');
  } finally {
    await request('', 'DELETE');
  }
});
