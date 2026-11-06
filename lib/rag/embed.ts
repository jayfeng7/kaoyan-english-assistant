import 'server-only';
import { z } from 'zod';

export const embeddingModel = 'qwen3-embedding:0.6b';
export const embeddingFormat = 'qwen3-essay-v1';
const instruction = 'Retrieve English writing guidance that answers the learner’s question.';
const tagsSchema = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/u) })) });
const vectorsSchema = z.object({ model: z.literal(embeddingModel), embeddings: z.array(z.array(z.number().finite())) });

async function ollama(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
  const base = new URL(process.env.RAG_OLLAMA_URL ?? 'http://127.0.0.1:11434');
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('Invalid Ollama URL');
  const response = await fetch(new URL(path, base), {
    signal, cache: 'no-store', redirect: 'error',
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error('Ollama request failed');
  return response.json();
}

export async function modelDigest(signal: AbortSignal): Promise<string> {
  const tags = tagsSchema.parse(await ollama('/api/tags', signal));
  const model = tags.models.find(({ name }) => name === embeddingModel);
  if (!model) throw new Error('Embedding model is missing');
  return model.digest;
}

export function normalizeVector(vector: number[]): number[] {
  const norm = Math.hypot(...vector);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('Invalid embedding norm');
  return vector.map((value) => value / norm);
}

export async function embed(texts: string[], kind: 'query' | 'document', signal: AbortSignal): Promise<number[][]> {
  const input = kind === 'query' ? texts.map((text) => `Instruct: ${instruction}\nQuery: ${text}`) : texts;
  const { embeddings } = vectorsSchema.parse(await ollama('/api/embed', signal, { model: embeddingModel, input, truncate: false }));
  if (embeddings.length !== texts.length || embeddings.some((vector) => vector.length !== 1024)) {
    throw new Error('Unexpected embedding shape');
  }
  return embeddings.map(normalizeVector);
}
