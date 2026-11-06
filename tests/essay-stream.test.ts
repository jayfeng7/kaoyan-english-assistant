import { describe, expect, it, vi } from 'vitest';
import { EssayPreviewReader } from '@/lib/llm/essay-preview';
import { streamEssay, streamStructuredProvider } from '@/lib/llm/essay-stream';
import { ProviderFailure } from '@/lib/llm/client';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import { buildEssayPrompt } from '@/lib/prompts/essay';
import { makeEssayResult, makeProviders } from './fixtures';
import type { EssayStreamEvent, StructuredStreamCall } from '@/types';

const params = { system: 'Synthetic teacher', user: 'Synthetic essay' };
const schema = createEssayResultSchema('english1', 'big');
async function collect(call: StructuredStreamCall) {
  const events: EssayStreamEvent[] = [];
  for await (const event of streamEssay(params, schema, { id: 'test', startedAt: 0 }, { providers: makeProviders(), call })) events.push(event);
  return events;
}
describe('safe incremental essay previews', () => {
  it('streams readable fields and whole validated annotations across single-character chunks, excluding scores', () => {
    const reader = new EssayPreviewReader(); const result = makeEssayResult();
    result.overallComment = '中文“引文” \\ and "quotes"\n下一行📖';
    const events = [...JSON.stringify(result)].flatMap(char => reader.push(char));
    for (const field of ['overallComment', 'improvedEssay', 'modelEssay'] as const) expect(events.flatMap(event => event.type === 'preview' && event.field === field ? [event.text] : []).join('')).toBe(result[field]);
    expect(events.filter(event => event.type === 'annotation')).toEqual([{ type: 'annotation', annotation: result.sentenceAnnotations[0] }]);
    expect(JSON.stringify(events)).not.toContain('scoreCard'); expect(events.some(event => event.type === 'preview' && event.field === 'overallComment' && event.text.length < result.overallComment.length)).toBe(true);
  });
  it('waits for split escapes and ignores nested keys, raw JSON and incomplete annotations', () => {
    const reader = new EssayPreviewReader();
    expect(reader.push('{"scoreCard":{"overallComment":"not root"},"sentenceAnnotations":[{"index":1')).toEqual([]);
    expect(reader.push('}],"overallComment":"\\u4e')).toEqual([]);
    expect(reader.push('2d\\nA\\')).toEqual([{ type: 'preview', field: 'overallComment', text: '中\nA' }]);
    expect(reader.push('\\B"}')).toContainEqual({ type: 'preview', field: 'overallComment', text: '\\B' });
  });
});
describe('structured streaming and validation', () => {
  it.each([['english1', 'big'], ['english2', 'big'], ['english1', 'small'], ['english2', 'small']] as const)('keeps the prompt example valid for %s/%s', (type, composition) => {
    const prompt = buildEssayPrompt({ type, composition, prompt: 'Synthetic task', essay: 'Synthetic essay' });
    const example = prompt.system.split('\n').find(line => line.startsWith('{"scoreCard":'));
    expect(example).toBeDefined(); expect(createEssayResultSchema(type, composition).safeParse(JSON.parse(example!)).success).toBe(true);
  });
  it('emits an early status and previews before a fully validated final result', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { for (const char of JSON.stringify(makeEssayResult())) yield char; });
    const events = await collect(call);
    expect(events[0]).toEqual({ type: 'status', stage: 'generating' }); expect(events.at(-1)).toEqual({ type: 'done', data: makeEssayResult(), provider: 'deepseek' }); expect(call).toHaveBeenCalledOnce();
    expect(events.findIndex(event => event.type === 'preview')).toBeLessThan(events.length - 1);
  });
  it('switches on timeout before preview, without extra requests after success', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementationOnce(async function* () { yield '{"scoreCard":'; throw new ProviderFailure('timeout'); }).mockImplementationOnce(async function* () { yield JSON.stringify(makeEssayResult()); });
    expect((await collect(call)).at(-1)).toMatchObject({ type: 'done', provider: 'siliconflow' }); expect(call).toHaveBeenCalledTimes(2);
  });
  it('keeps previews on interruption and does not mix a backup response', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { yield '{"overallComment":"Preview'; throw new ProviderFailure('timeout'); });
    const events: EssayStreamEvent[] = [];
    await expect(async () => { for await (const event of streamEssay(params, schema, { id: 'test', startedAt: 0 }, { providers: makeProviders(), call })) events.push(event); }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' });
    expect(events).toContainEqual({ type: 'preview', field: 'overallComment', text: 'Preview' }); expect(events.some(event => event.type === 'done')).toBe(false); expect(call).toHaveBeenCalledOnce();
  });
  it('keeps an invalid English II score out of the result while allowing discussion of text feedback', async () => {
    const result = makeEssayResult(); result.scoreCard.score = 20; result.scoreCard.band.level = 5; result.scoreCard.breakdown = { content: 10, language: 7, structure: 3 };
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { yield JSON.stringify(result); });
    const events: EssayStreamEvent[] = [];
    const context = { id: 'test', startedAt: 0 };
    for await (const event of streamEssay(params, createEssayResultSchema('english2', 'big'), context, { providers: makeProviders(), call })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { text: expect.stringContaining('未完成有效评分') } });
    expect(JSON.stringify(events.at(-1))).not.toContain('scoreCard'); expect(call).toHaveBeenCalledOnce();
    expect(context).toMatchObject({ formatFailure: 'schema' });
  });
  it('does not block follow-up when a completed response has unrecoverable JSON after readable feedback', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { yield '{"overallComment":"Useful draft feedback.","broken":function(){}}'; });
    const events = await collect(call);
    expect(events.at(-1)).toMatchObject({ type: 'done', data: { text: expect.stringContaining('Useful draft feedback.') } });
    expect(JSON.stringify(events.at(-1))).not.toContain('function()'); expect(call).toHaveBeenCalledOnce();
  });
  it('never starts a provider for an already cancelled request', async () => {
    const call = vi.fn<StructuredStreamCall>();
    await expect(async () => { for await (const event of streamEssay({ ...params, signal: AbortSignal.abort() }, schema, { id: 'test', startedAt: 0 }, { providers: makeProviders(), call })) void event; }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).not.toHaveBeenCalled();
  });
  it('does not switch on credential failure', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { throw { status: 401 }; yield ''; });
    await expect(collect(call)).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' }); expect(call).toHaveBeenCalledOnce();
  });
  it('uses JSON mode, disabled thinking, the configured model and the existing token budget', async () => {
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"{}"}}]}\n\ndata: [DONE]\n\n')); controller.close(); } });
    const fetcher = vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })); vi.stubGlobal('fetch', fetcher);
    for await (const chunk of streamStructuredProvider(makeProviders()[0]!, params)) expect(chunk).toBe('{}');
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true, response_format: { type: 'json_object' }, thinking: { type: 'disabled' }, max_tokens: 8000, model: 'test-model' });
  });
});
