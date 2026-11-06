import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/chat/route';
import { streamWithFallback } from '@/lib/llm/stream';
import cards from '@/lib/rag/cards.json';
import { embed, modelDigest } from '@/lib/rag/embed';
import { loadVectorIndex } from '@/lib/rag/vector-index';
import { chatStreamEventSchema } from '@/lib/schemas/chat';
import * as logger from '@/lib/utils/logger';
import type { ChatRequest } from '@/types';

vi.mock('@/lib/llm/stream', () => ({ streamWithFallback: vi.fn() }));
vi.mock('@/lib/rag/embed', () => ({ embed: vi.fn(), modelDigest: vi.fn() }));
vi.mock('@/lib/rag/vector-index', () => ({ loadVectorIndex: vi.fn() }));

const reply = 'invitation.reply.v1';
const notice = 'notice.arrangement.v1';
const previous = '邀请信怎么请对方回复？';
type ReplayCase = {
  id: string;
  question: string;
  previous?: string;
  timeout?: boolean;
  expectedQuery?: string;
  expectedCitation?: string;
};

const cases: ReplayCase[] = [
  { id: 'dense-paraphrase', question: '最后一句怎么问他来不来？', expectedQuery: '最后一句怎么问他来不来?', expectedCitation: reply },
  { id: 'followup-rewrite', question: '换个例句。', previous, expectedQuery: `${previous}\n换个例句。`, expectedCitation: reply },
  { id: 'wrong-genre-abstention', question: '通知里怎么说明到场要求？' },
  { id: 'embedding-timeout-keyword-fallback', question: previous, timeout: true, expectedQuery: '邀请信怎么请对方回复?', expectedCitation: reply },
  { id: 'embedding-timeout-no-evidence', question: '最后一句怎么问他来不来？', timeout: true, expectedQuery: '最后一句怎么问他来不来?' },
];

describe('essay RAG replay through the chat route', () => {
  beforeEach(() => {
    vi.stubEnv('ESSAY_RAG_ENABLED', '1');
    vi.stubEnv('ESSAY_RAG_MODE', 'hybrid');
    vi.stubEnv('ESSAY_RAG_REWRITE', '1');
    vi.stubEnv('ESSAY_RAG_MIN_COSINE', '0.4');
    vi.stubEnv('ESSAY_RAG_TRACE', '0');
    vi.spyOn(logger, 'logRequest').mockImplementation(() => {});
    vi.mocked(modelDigest).mockResolvedValue('replay-digest');
    vi.mocked(embed).mockResolvedValue([[1, 0]]);
    vi.mocked(loadVectorIndex).mockResolvedValue({
      format: 'qwen3-essay-v1', model: 'qwen3-embedding:0.6b', digest: 'replay-digest',
      corpusHash: 'replay-corpus', dimension: 1024, distance: 'cosine',
      vectors: [{ id: reply, vector: [0.9, 0] }, { id: notice, vector: [1, 0] }],
    });
  });

  it.each(cases)('$id', async (scenario) => {
    if (scenario.timeout) vi.mocked(embed).mockRejectedValueOnce(new DOMException('Replay embedding timeout', 'TimeoutError'));
    vi.mocked(streamWithFallback).mockImplementation(async function* () {
      if (scenario.expectedCitation) {
        // Exercise both a split valid marker and a split unrecognized marker.
        for (const content of ['例句〔', '1〕。〔9', '9〕']) yield { type: 'delta', content };
      } else {
        yield { type: 'delta', content: '请结合当前作文题目来判断。' };
      }
      yield { type: 'done', provider: 'deepseek' };
    });
    const input: ChatRequest = {
      followUp: { kind: 'essay', summary: JSON.stringify({ composition: 'small', prompt: 'Invite a classmate to an event.', score: 8 }) },
      messages: [
        ...(scenario.previous ? [
          { role: 'user' as const, content: scenario.previous },
          { role: 'assistant' as const, content: '可以先确定对方能否出席。' },
        ] : []),
        { role: 'user', content: scenario.question },
      ],
    };
    const response = await POST(new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': scenario.id },
      body: JSON.stringify(input),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const frames = (await response.text()).trim().split('\n\n')
      .map((line) => chatStreamEventSchema.parse(JSON.parse(line.slice('data: '.length))));
    const terminal = frames.at(-1);
    expect(frames.slice(0, -1).every(({ type }) => type === 'delta')).toBe(true);
    expect(frames.length).toBeGreaterThan(1);
    expect(terminal?.type).toBe('done');
    expect(terminal?.type === 'done' ? terminal.citations?.map(({ id }) => id) ?? [] : [])
      .toEqual(scenario.expectedCitation ? [scenario.expectedCitation] : []);
    expect(frames.filter((frame) => frame.type === 'delta').map((frame) => frame.content).join(''))
      .toBe(scenario.expectedCitation ? '例句〔1〕。' : '请结合当前作文题目来判断。');

    if (scenario.expectedQuery) {
      expect(embed).toHaveBeenCalledExactlyOnceWith([scenario.expectedQuery], 'query', expect.any(AbortSignal));
    } else {
      expect(embed).not.toHaveBeenCalled();
    }
    expect(streamWithFallback).toHaveBeenCalledTimes(1);
    const generation = vi.mocked(streamWithFallback).mock.calls[0]?.[0];
    expect(generation?.messages).toEqual(input.messages);
    expect(generation?.system).toContain('不另行打分');
    const title = cards.find(({ id }) => id === reply)!.title;
    if (scenario.expectedCitation) expect(generation?.system).toContain(title);
    else expect(generation?.system).not.toContain('以下是本次检索到的项目原创教学卡片');
  });
});
