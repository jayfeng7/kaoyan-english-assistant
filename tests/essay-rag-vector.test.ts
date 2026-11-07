import { beforeEach, describe, expect, it, vi } from 'vitest';
import { embed, modelDigest } from '@/lib/rag/embed';
import { loadVectorIndex } from '@/lib/rag/vector-index';
import cards from '@/lib/rag/cards.json';
import { packEssayEvidence, prepareEssayQuery, searchEssayKnowledge } from '@/lib/rag/retriever';
import type { ChatRequest } from '@/types';

vi.mock(import('@/lib/rag/embed'), async (original) => ({ ...await original(), embed: vi.fn(), modelDigest: vi.fn() }));
vi.mock(import('@/lib/rag/vector-index'), async (original) => ({ ...await original(), loadVectorIndex: vi.fn() }));

function question(content: string): ChatRequest {
  return {
    messages: [{ role: 'user', content }],
    followUp: { kind: 'essay', summary: JSON.stringify({ composition: 'small', prompt: 'Invite a classmate to an event.' }) },
  };
}

describe('vector and hybrid essay retrieval', () => {
  beforeEach(() => {
    vi.mocked(modelDigest).mockResolvedValue('test-digest');
    vi.mocked(embed).mockResolvedValue([[1, 0]]);
    vi.mocked(loadVectorIndex).mockResolvedValue({
      format: 'qwen3-essay-v1', model: 'qwen3-embedding:0.6b', digest: 'test-digest',
      corpusHash: 'test-corpus', dimension: 1024, distance: 'cosine',
      vectors: [
        { id: 'notice.arrangement.v1', vector: [1, 0] },
        { id: 'invitation.schedule.v1', vector: [0.91, 0] },
        { id: 'invitation.reply.v1', vector: [0.85, 0] },
        { id: 'grammar.articles.v1', vector: [0.6, 0] },
      ],
    });
  });

  it('recalls vector-only paraphrases while excluding conflicting genres and low scores', async () => {
    const result = await searchEssayKnowledge(question('What logistics should a guest know?'), { mode: 'vector', minimumCosine: 0.9 });
    expect(result.cards.map(({ id }) => id)).toEqual(['invitation.schedule.v1']);
    expect(result.keyword).toEqual([]);
    expect(result.fallback).toBe(false);
  });

  it('prioritizes agreement between the keyword and vector rankings', async () => {
    const result = await searchEssayKnowledge(question('邀请信怎么请对方回复？'), { mode: 'hybrid', minimumCosine: 0.7 });
    expect(result.vector[0]?.id).toBe('invitation.schedule.v1');
    expect(result.cards.map(({ id }) => id)).toEqual(['invitation.reply.v1', 'invitation.schedule.v1']);
  });

  it('abstains before embedding when the learner asks about a conflicting genre', async () => {
    const result = await searchEssayKnowledge(question('通知里如何说明到场要求？'), { mode: 'hybrid' });
    expect(result.cards).toEqual([]);
    expect(embed).not.toHaveBeenCalled();
  });

  it('drops a weak dense-only secondary source while retaining a keyword corroborated source', () => {
    const vector = [{ id: 'first', score: 0.72 }, { id: 'second', score: 0.57 }, { id: 'third', score: 0.49 }];
    expect(packEssayEvidence(vector, [], vector).map(({ id }) => id)).toEqual(['first']);
    expect(packEssayEvidence(vector, [{ id: 'third', score: 2 }], vector).map(({ id }) => id)).toEqual(['first', 'third']);
  });

  it('falls back to keyword retrieval on a mismatched model, while strict eval fails', async () => {
    vi.mocked(modelDigest).mockResolvedValue('different-digest');
    const input = question('邀请信怎么请对方回复？');
    const fallback = await searchEssayKnowledge(input, { mode: 'vector' });
    expect(fallback.fallback).toBe(true);
    expect(fallback.cards.map(({ id }) => id)).toEqual(['invitation.reply.v1']);
    expect(embed).not.toHaveBeenCalled();
    await expect(searchEssayKnowledge(input, { mode: 'vector', strict: true })).rejects.toThrow('digest');
  });

  it('filters Qdrant by eligible point IDs and rejects an out-of-scope response', async () => {
    const allowedIds = cards.flatMap(({ composition, genres }, i) =>
      (composition === 'any' || composition === 'small') && (genres.includes('any') || genres.includes('invitation')) ? [i] : []);
    const reply = cards.findIndex(({ id }) => id === 'invitation.reply.v1');
    const schedule = cards.findIndex(({ id }) => id === 'invitation.schedule.v1');
    const notice = cards.findIndex(({ id }) => id === 'notice.arrangement.v1');
    const points = allowedIds.slice(0, 6).map((id) => ({ id, score: id === reply ? 0.9 : id === schedule ? 0.7 : 0.2 }));
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ time: 0.001, result: { points } }))
      .mockResolvedValueOnce(Response.json({ time: 0.001, result: { points: [{ id: notice, score: 1 }, ...points.slice(1)] } }));
    vi.stubGlobal('fetch', fetch);
    const input = question('邀请信怎么请对方回复？');
    const result = await searchEssayKnowledge(input, { mode: 'hybrid', backend: 'qdrant-exact' });
    expect(result.vector.map(({ id }) => id)).toEqual(['invitation.reply.v1', 'invitation.schedule.v1']);
    const requestBody = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(requestBody).toMatchObject({ params: { exact: true }, filter: { must: [{ has_id: allowedIds }] } });
    expect(loadVectorIndex).not.toHaveBeenCalled();
    const fallback = await searchEssayKnowledge(input, { mode: 'hybrid', backend: 'qdrant-exact' });
    expect(fallback.fallback).toBe(true);
    expect(fallback.cards.map(({ id }) => id)).toEqual(['invitation.reply.v1']);
  });

  it('uses bounded learner context for a pointer and preserves a new question', () => {
    const input = question('邀请信怎么请对方回复？');
    input.messages.push({ role: 'assistant', content: 'ASSISTANT_TEXT' }, { role: 'user', content: '换个例句。' });
    expect(prepareEssayQuery(input)?.query).toBe('邀请信怎么请对方回复？\n换个例句。');
    expect(prepareEssayQuery(input, false)?.query).toBe('换个例句。');
    input.messages.push({ role: 'user', content: '再举一个例子说明情态动词。' });
    expect(prepareEssayQuery(input)?.query).toBe('再举一个例子说明情态动词。');
  });
});
