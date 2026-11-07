import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { evalCaseSchema } from './rag-eval-fixtures';

const nonempty = z.string().trim().min(1);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/u);
const manifestSchema = z.object({
  version: nonempty,
  corpusHash: sha256,
  cases: z.array(evalCaseSchema.extend({
    family: nonempty,
    author: nonempty,
    reviewer: nonempty,
    expected: z.enum(['grounded', 'no_evidence']),
    requiredClaims: z.array(z.object({ text: nonempty, evidenceIds: z.array(nonempty).min(1) })),
  })).min(1),
});

function canonical(text: string) {
  return text.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

export function validateReviewedDataset(raw: unknown, cardIds: ReadonlySet<string>) {
  const manifest = manifestSchema.parse(raw);
  const splits = new Map<string, string>();
  const ids = new Set<string>();
  const inputs = new Set<string>();
  for (const row of manifest.cases) {
    const family = canonical(row.family);
    const id = canonical(row.id);
    const signature = JSON.stringify([row.composition, row.prompt, row.previous ?? '', row.question].map(canonical));
    if (!id || !canonical(row.prompt) || !canonical(row.question)) throw new Error('Case ID, prompt and question are required');
    if (ids.has(id) || inputs.has(signature)) throw new Error(`Duplicate case or input: ${id}`);
    if (splits.has(family) && splits.get(family) !== row.split) throw new Error(`Family crosses dataset splits: ${family}`);
    if (canonical(row.author) === canonical(row.reviewer)) throw new Error(`Independent review required: ${id}`);
    ids.add(id);
    inputs.add(signature);
    splits.set(family, row.split);

    const evidence = new Set(Object.keys(row.relevance));
    if ([...evidence].some((card) => !cardIds.has(card))) throw new Error(`Unknown evidence ID: ${id}`);
    if (row.expected === 'grounded') {
      if (!evidence.size || !row.requiredClaims.length ||
        row.requiredClaims.some(({ evidenceIds }) => evidenceIds.some((card) => !evidence.has(card)))) {
        throw new Error(`Grounded claims require labeled evidence: ${id}`);
      }
    } else if (evidence.size || row.requiredClaims.length) {
      throw new Error(`No-evidence case has evidence labels: ${id}`);
    }
  }
  for (const split of ['dev', 'holdout'] as const) {
    const rows = manifest.cases.filter((row) => row.split === split);
    if (!rows.some(({ expected }) => expected === 'grounded') || !rows.some(({ expected }) => expected === 'no_evidence')) {
      throw new Error(`Expected both grounded and no-evidence cases in ${split}`);
    }
  }
  return manifest;
}

export async function loadReviewedDataset(path: string, expectedHash: string | undefined, cardIds: ReadonlySet<string>) {
  const pinned = sha256.parse(expectedHash?.toLowerCase());
  const bytes = await readFile(path);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (pinned !== hash) throw new Error('Reviewed dataset SHA-256 does not match the frozen file');
  const manifest = validateReviewedDataset(JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')), cardIds);
  return { ...manifest, hash };
}
