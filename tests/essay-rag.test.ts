import { describe, expect, it, vi } from 'vitest';
import { retrieveEssayCards } from '@/lib/rag/retriever';
import type { ChatRequest } from '@/types';

function essayQuestion(question: string, prompt: string, composition = 'small'): ChatRequest {
  return {
    messages: [{ role: 'user', content: question }],
    followUp: { kind: 'essay', summary: JSON.stringify({ composition, prompt }) },
  };
}

describe('essay knowledge retrieval', () => {
  it.each([
    ['邀请信里怎么礼貌地请对方回复？', 'Write an invitation to a friend.', 'small', 'invitation.reply.v1'],
    ['How do I get an RSVP from a pal?', 'Invite a friend to the event.', 'small', 'invitation.reply.v1'],
    ['活动时间和地点怎么交代？', 'Write a notice for the students.', 'small', 'notice.arrangement.v1'],
    ['从 20% 到 25% 是 5 个百分点吗？', 'Describe the chart.', 'big', 'chart.units.v1'],
    ['He go to school 为什么有问题？', 'Write about your daily routine.', 'big', 'grammar.subject-verb.v1'],
    ['建议信里怎么提出具体行动？', 'Write a letter to give some advice.', 'small', 'advice.specific.v1'],
  ])('ranks a relevant card first for %s', async (question, prompt, composition, id) => {
    expect((await retrieveEssayCards(essayQuestion(question, prompt, composition)))[0]?.id).toBe(id);
  });

  it.each([
    ['量子纠缠发生退相干的机制是什么？', 'Describe the picture.', 'big'],
    ['邀请信怎么请求回复？', 'Write a notice.', 'small'],
    ['图表的百分点怎么算？', 'Describe the chart.', 'small'],
    ['为什么是这个分数？', 'Write an invitation.', 'small'],
  ])('skips retrieval for %s when no card applies', async (question, prompt, composition) => {
    expect(await retrieveEssayCards(essayQuestion(question, prompt, composition))).toEqual([]);
  });

  it('uses the previous user question for a short request for another example', async () => {
    const input = essayQuestion('He go 为什么错？', 'Write a short letter.');
    input.messages.push({ role: 'assistant', content: '先判断时态。' }, { role: 'user', content: '再举一个例子。' });
    expect((await retrieveEssayCards(input))[0]?.id).toBe('grammar.subject-verb.v1');
  });

  it('skips generic chat, legacy unstructured context and disabled retrieval', async () => {
    const input = essayQuestion('He go 为什么错？', 'Write a short letter.');
    expect(await retrieveEssayCards({ messages: input.messages })).toEqual([]);
    expect(await retrieveEssayCards({ ...input, followUp: { kind: 'essay', summary: '旧版摘要' } })).toEqual([]);
    vi.stubEnv('ESSAY_RAG_ENABLED', '0');
    expect(await retrieveEssayCards(input)).toEqual([]);
  });
});
