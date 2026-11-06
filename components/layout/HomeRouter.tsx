'use client';
import { useState } from 'react';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useWorkspace, patchEssay, patchSentence, patchExam } from '@/lib/client/workspace';
import { useTask } from '@/lib/client/task';
import { postApi } from '@/lib/client/api';
import { reviewedText } from '@/lib/client/essay-input';
import { routeRequestSchema, routerResultSchema } from '@/lib/schemas/router';
import type { RouterResult } from '@/types';

export function HomeRouter() {
  const input = useWorkspace((state) => state.homeInput);
  const [pending, setPending] = useState<RouterResult>();
  const task = useTask(); const router = useRouter(); const { notify } = useToast();
  function navigate(result: RouterResult) {
    const { agent } = result;
    if (agent === 'essay') patchEssay({ essay: input, essayReview: undefined, record: undefined, ocrResult: undefined, ocrText: '', ocrConfirmed: false });
    if (agent === 'sentence') patchSentence({ sentence: input, record: undefined });
    if (agent === 'exam') patchExam({ source: 'paste', passage: input, record: undefined });
    if (agent === 'chat') useWorkspace.setState({ chatInput: input });
    notify(`${result.reason}；内容已填入，请确认后继续`);
    router.push(`/${agent}`);
  }
  async function route() {
    await task.run(async (signal) => {
      const { data } = await postApi('/api/route', { input }, routerResultSchema, signal);
      const state = useWorkspace.getState();
      const previous = data.agent === 'essay' ? reviewedText(state.essay.essayReview, state.essay.ocrResult ? state.essay.ocrText : state.essay.essay) : data.agent === 'sentence' ? state.sentence.sentence : data.agent === 'exam' ? state.exam.passage : state.chatInput;
      if (previous.trim() && previous !== input) setPending(data);
      else navigate(data);
    });
  }
  return <Card className="mb-6">
    <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void route(); }}>
      <Textarea label="今天想练习什么？" value={input} onChange={(event) => useWorkspace.setState({ homeInput: event.target.value })} rows={3} characterLimit={8000} disabled={task.busy || Boolean(pending)} placeholder="粘贴作文、长难句、阅读材料，或写下一个问题…" />
      <TaskFeedback error={task.error} onRetry={() => { void route(); }} disabled={task.busy || !routeRequestSchema.safeParse({ input }).success} /><div className="flex flex-wrap items-center gap-3"><Button type="submit" loading={task.busy} disabled={Boolean(pending) || !routeRequestSchema.safeParse({ input }).success}>帮我选择学习入口</Button><p className="text-xs leading-6 text-muted">先识别任务，跳转后由你确认开始。</p></div>
    </form>
    <Modal open={Boolean(pending)} title="该页面已有草稿" onClose={() => setPending(undefined)}>
      <p className="text-sm leading-7">填入这次内容会替换该页面的输入，已经保存的历史不受影响。取消后两份输入都会保留在原处。</p>
      <div className="mt-6 flex gap-3"><Button variant="secondary" onClick={() => setPending(undefined)}>取消，保留原草稿</Button><Button onClick={() => { if (pending) navigate(pending); setPending(undefined); }}>替换并前往</Button></div>
    </Modal>
  </Card>;
}
