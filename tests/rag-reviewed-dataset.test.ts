import { createHash, randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadReviewedDataset, validateReviewedDataset } from './rag-reviewed-dataset';

const card = 'invitation.reply.v1';
const cardIds = new Set([card]);

function manifest() {
  return {
    version: 'test-reviewed',
    corpusHash: 'a'.repeat(64),
    cases: [
      { id: 'dev-positive', split: 'dev', expected: 'grounded' },
      { id: 'dev-negative', split: 'dev', expected: 'no_evidence' },
      { id: 'holdout-positive', split: 'holdout', expected: 'grounded' },
      { id: 'holdout-negative', split: 'holdout', expected: 'no_evidence' },
    ].map((row) => ({
      ...row, family: row.id, author: 'author', reviewer: 'reviewer',
      group: row.expected === 'grounded' ? 'direct' : 'negative',
      composition: 'small', prompt: 'Write an invitation.',
      question: `Synthetic query ${row.id}`,
      relevance: row.expected === 'grounded' ? { [card]: 2 } : {},
      requiredClaims: row.expected === 'grounded' ? [{ text: 'Ask the recipient to reply.', evidenceIds: [card] }] : [],
    })),
  };
}

describe('reviewed RAG dataset intake', () => {
  it('loads the exact reviewed bytes and rejects a changed file before evaluation', async () => {
    const path = join(tmpdir(), `rag-reviewed-${randomUUID()}.json`);
    const original = JSON.stringify(manifest());
    const hash = createHash('sha256').update(original).digest('hex');
    try {
      await writeFile(path, original, { flag: 'wx' });
      expect((await loadReviewedDataset(path, hash, cardIds)).cases).toHaveLength(4);
      await writeFile(path, original + '\n');
      await expect(loadReviewedDataset(path, hash, cardIds)).rejects.toThrow('does not match the frozen file');
    } finally {
      await rm(path, { force: true });
    }
  });

  it('rejects a paraphrase family split between development and holdout', () => {
    const input = manifest();
    input.cases[2]!.family = input.cases[0]!.family;
    expect(() => validateReviewedDataset(input, cardIds)).toThrow('Family crosses dataset splits');
  });

  it('rejects self-review even when the reviewer name uses different casing', () => {
    const input = manifest();
    input.cases[0]!.reviewer = ' AUTHOR ';
    expect(() => validateReviewedDataset(input, cardIds)).toThrow('Independent review required');
  });

  it('rejects claims with evidence outside the relevance labels', () => {
    const input = manifest();
    input.cases[0]!.requiredClaims[0]!.evidenceIds = ['unlabeled.card'];
    expect(() => validateReviewedDataset(input, cardIds)).toThrow('Grounded claims require labeled evidence');
  });
});
