import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { retrievalMetrics } from '@/lib/rag/bm25.mjs';
import { embed } from '@/lib/rag/embed';
import { fuseRankings, searchEssayKnowledge, type RetrievalMode } from '@/lib/rag/retriever';
import { loadVectorIndex } from '@/lib/rag/vector-index';
import cards from '@/lib/rag/cards.json';
import { cases, mean, percentile, toChatRequest, type EvalCase } from './rag-eval-fixtures';
import { loadReviewedDataset } from './rag-reviewed-dataset';

type Hit = { id: string; score: number };
type Row = { sample: EvalCase } & Awaited<ReturnType<typeof searchEssayKnowledge>>;

function summarize(rows: { sample: EvalCase; hits: Hit[]; durationMs: number; denseMs: number }[]) {
  const measured = rows.map(({ sample, hits }) => retrievalMetrics(hits, sample.relevance, 2));
  return {
    cases: rows.length,
    recallAt2: mean(measured.map((row) => row.recall)),
    mrrAt2: mean(measured.map((row) => row.reciprocalRank)),
    ndcgAt2: mean(measured.map((row) => row.ndcg)),
    correctEmpty: mean(measured.map((row) => row.correctEmpty === null ? null : Number(row.correctEmpty))),
    p50Ms: percentile(rows.map((row) => row.durationMs), 0.5),
    p95Ms: percentile(rows.map((row) => row.durationMs), 0.95),
    denseP95Ms: percentile(rows.map((row) => row.denseMs), 0.95),
  };
}

function summarizeEvidence(rows: Row[], packed: boolean) {
  const evidence = rows.map((row) => ({ sample: row.sample, hits: packed ? row.evidence : row.hits.slice(0, 2) }));
  return {
    recallAt2: mean(evidence.map(({ sample, hits }) => retrievalMetrics(hits, sample.relevance, 2).recall)),
    precision: mean(evidence.map(({ sample, hits }) => hits.length
      ? hits.filter(({ id }) => Object.hasOwn(sample.relevance, id)).length / hits.length : null)),
    cards: evidence.reduce((sum, row) => sum + row.hits.length, 0),
  };
}

it('compares retrieval variants on the fixed holdout or calibrates on dev', async () => {
  const cardIds = new Set(cards.map(({ id }) => id));
  const datasetPath = process.env.RAG_EVAL_DATASET;
  const pinnedHash = process.env.RAG_EVAL_DATASET_SHA256;
  if (pinnedHash && !datasetPath) throw new Error('Set RAG_EVAL_DATASET when pinning its SHA-256');
  const reviewed = datasetPath
    ? await loadReviewedDataset(datasetPath, pinnedHash, cardIds)
    : undefined;
  const dataset = reviewed?.cases ?? cases;
  expect(new Set(dataset.map(({ id }) => id)).size).toBe(dataset.length);
  expect(dataset.every((sample) => Object.keys(sample.relevance).every((id) => cardIds.has(id)))).toBe(true);
  const { model, digest, corpusHash, format } = await loadVectorIndex();
  if (reviewed && reviewed.corpusHash !== corpusHash) throw new Error('Reviewed dataset was labeled against a different corpus');
  const configuredBackend = process.env.ESSAY_RAG_VECTOR_BACKEND;
  const backend = configuredBackend === 'qdrant-exact' || configuredBackend === 'qdrant-hnsw' ? configuredBackend : 'json';
  const datasetDirectory = reviewed ? join('artifacts', 'rag-reviewed', reviewed.hash) : 'artifacts';
  const outputDirectory = backend === 'json' ? datasetDirectory : join(datasetDirectory, backend);
  const calibration = process.env.RAG_EVAL_SPLIT === 'dev';
  const samples = dataset.filter(({ split }) => split === (calibration ? 'dev' : 'holdout'));
  const provenance = {
    datasetVersion: reviewed?.version ?? 'project-authored-v2',
    frozenFileHash: reviewed?.hash ?? null,
    datasetHash: createHash('sha256').update(JSON.stringify(samples)).digest('hex'),
    model, digest, corpusHash, format, backend,
    minimumCosineOverride: process.env.ESSAY_RAG_MIN_COSINE ?? null,
  };
  // Allow a cold model to load before measuring the production request budget.
  await embed(['Warm-up query.'], 'query', AbortSignal.timeout(30_000));
  if (calibration) {
    const raw: Row[] = [];
    for (const sample of samples) {
      raw.push({ sample, ...await searchEssayKnowledge(toChatRequest(sample), { mode: 'hybrid', minimumCosine: 0, strict: true }) });
    }
    const sweep = [0.4, 0.45, 0.5, 0.52, 0.55, 0.575, 0.6, 0.625, 0.65, 0.675, 0.7, 0.725, 0.75, 0.8].flatMap((threshold) =>
      (['vector', 'hybrid'] as const).map((mode) => {
        const rows = raw.map((row) => {
          const vector = row.vector.filter(({ score }) => score >= threshold);
          return { ...row, hits: mode === 'vector' ? vector : fuseRankings(row.keyword, vector) };
        });
        const { ndcgAt2, correctEmpty } = summarize(rows);
        return { threshold, mode, ndcgAt2, correctEmpty, balanced: mean([ndcgAt2, correctEmpty]) };
      }),
    );
    await mkdir(outputDirectory, { recursive: true });
    const details = raw.map(({ sample, keyword, vector }) => ({ id: sample.id, expected: sample.relevance, keyword, vector }));
    const report = join(outputDirectory, 'rag-calibration.json');
    await writeFile(report, JSON.stringify({ provenance, sweep, details }, null, 2));
    process.stdout.write(`RAG calibration saved to ${report}\n`);
    return;
  }

  const modes: RetrievalMode[] = ['keyword', 'vector', 'hybrid'];
  const variants = [];
  for (const mode of modes) {
    for (const rewrite of [false, true]) {
      const rows: Row[] = [];
      for (const sample of samples) {
        rows.push({ sample, ...await searchEssayKnowledge(toChatRequest(sample), { mode, rewrite, strict: true }) });
      }
      variants.push({
        mode, rewrite, overall: summarize(rows),
        context: { withoutPacking: summarizeEvidence(rows, false), withPacking: summarizeEvidence(rows, true) },
        byGroup: Object.fromEntries([...new Set(samples.map(({ group }) => group))]
          .map((group) => [group, summarize(rows.filter(({ sample }) => sample.group === group))])),
        details: rows.map(({ sample, hits, evidence, keyword, vector, rewritten, durationMs, denseMs }) =>
          ({ id: sample.id, group: sample.group, expected: sample.relevance, hits, evidence, keyword, vector, rewritten, durationMs, denseMs })),
      });
    }
  }
  const keywordAnchorAblation = [];
  for (const mode of ['keyword', 'hybrid'] as const) {
    const rows: Row[] = [];
    for (const sample of samples) {
      rows.push({ sample, ...await searchEssayKnowledge(toChatRequest(sample), {
        mode, rewrite: true, strict: true, requireKeywordAnchor: false,
      }) });
    }
    keywordAnchorAblation.push({
      mode, rewrite: true, requireKeywordAnchor: false,
      overall: summarize(rows), context: summarizeEvidence(rows, true),
      details: rows.map(({ sample, hits, evidence }) => ({ id: sample.id, group: sample.group, expected: sample.relevance, hits, evidence })),
    });
  }
  await mkdir(outputDirectory, { recursive: true });
  const report = join(outputDirectory, 'rag-retrieval-eval.json');
  await writeFile(report, JSON.stringify({ provenance, variants, keywordAnchorAblation }, null, 2));
  process.stdout.write(`RAG retrieval results saved to ${report}\n`);
});
