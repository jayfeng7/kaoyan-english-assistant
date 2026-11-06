import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import * as client from '@/lib/llm/client';
import * as bank from '@/lib/exam-bank';
import * as baidu from '@/lib/ocr/baidu';
import * as logger from '@/lib/utils/logger';
import { streamWithFallback } from '@/lib/llm/stream';
import { GET as health } from '@/app/api/health/route';
import { GET as list } from '@/app/api/exam/bank/route';
import { GET as detail } from '@/app/api/exam/bank/[id]/route';
import { POST as essay } from '@/app/api/essay/correct/route';
import { POST as sentence } from '@/app/api/sentence/analyze/route';
import { POST as exam } from '@/app/api/exam/analyze/route';
import { POST as chat } from '@/app/api/chat/route';
import { POST as ocr } from '@/app/api/ocr/route';
import { AppError } from '@/lib/utils/errors';
import { makeBankItem, makeEssayResult, makeExamData, makeSentenceResult } from './fixtures';
import type { ApiResponse, ChatStreamEvent, EssayResult, ExamBankItem, ExamBankList, ExamResult, HealthData, OcrResult, SentenceResult, TextFallback } from '@/types';

vi.mock('@/lib/llm/stream', () => ({ streamWithFallback: vi.fn() }));
let sequence = 0;
function request(path: string, input?: unknown, ip = `test-${++sequence}`): Request {
  return new Request(`http://localhost${path}`, { method: input === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
}
async function json<T>(response: Response): Promise<ApiResponse<T>> { return await response.json() as ApiResponse<T>; }
const essayInput = { type: 'english1', composition: 'big', prompt: 'Write about practice.', essay: 'Learning takes practice.' };
const sentenceInput = { sentence: 'Although learning takes time, practice helps.' };
const examInput = { type: 'english1', source: 'bank', bankId: 'english1-2025-text1' };
const chatInput = { messages: [{ role: 'user', content: '如何练习？' }] };

beforeEach(() => {
  vi.stubEnv('DEEPSEEK_API_KEY', 'private-test-key');
  vi.stubEnv('SILICONFLOW_API_KEY', ''); vi.stubEnv('OPENROUTER_API_KEY', '');
  vi.stubEnv('BAIDU_OCR_API_KEY', 'private-ocr-key'); vi.stubEnv('BAIDU_OCR_SECRET_KEY', 'private-ocr-secret');
  vi.spyOn(logger, 'logRequest').mockImplementation(() => {});
  vi.spyOn(client, 'callProvider').mockResolvedValue(JSON.stringify(makeSentenceResult()));
  vi.spyOn(bank, 'getBankCount').mockResolvedValue(156);
  vi.spyOn(bank, 'getBankList').mockResolvedValue({ items: [{ id: 'english1-2025-text1', type: 'english1', year: 2025, section: 'Text 1' }], total: 1 });
  vi.spyOn(bank, 'getBankItem').mockResolvedValue(makeBankItem());
  vi.spyOn(baidu, 'recognizeHandwriting').mockResolvedValue({ text: 'Practice helps.', confidence: 0.9, lowConfidenceWords: [] });
  vi.mocked(streamWithFallback).mockImplementation(async function* (_params, options): AsyncGenerator<ChatStreamEvent> {
    options?.onProvider?.('deepseek');
    yield { type: 'delta', content: '练习' }; yield { type: 'delta', content: '很重要。' }; yield { type: 'done', provider: 'deepseek' };
  });
});

describe('health and read-only exam endpoints', () => {
  it('reports configured capabilities without credentials', async () => {
    const response = await health(request('/api/health')); const body = await json<HealthData>(response);
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ status: 'ok', providers: ['deepseek'], ocr: true, examBankCount: 156 });
    expect(body.data?.time).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/private-|apiKey|secret|baseURL/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it('reports missing optional credentials as unavailable', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', ''); vi.stubEnv('BAIDU_OCR_SECRET_KEY', '');
    const body = await json<HealthData>(await health(request('/api/health')));
    expect(body.data?.providers).toEqual([]); expect(body.data?.ocr).toBe(false);
  });
  it('passes filters through validation and returns metadata only', async () => {
    const response = await list(request('/api/exam/bank?type=english1&year=2025&q=practice'));
    const body = await json<ExamBankList>(response);
    expect(response.status).toBe(200); expect(bank.getBankList).toHaveBeenCalledWith({ type: 'english1', year: 2025, q: 'practice' });
    expect(body.data?.items[0]).not.toHaveProperty('passage'); expect(body.data?.items[0]).not.toHaveProperty('questions');
  });
  it.each(['type=unknown', 'year=no', 'year=0', 'year=2025.5', 'year='])('rejects invalid bank filter %s', async (query) => {
    const response = await list(request(`/api/exam/bank?${query}`));
    expect(response.status).toBe(400); expect((await json(response)).code).toBe('INVALID_INPUT'); expect(bank.getBankList).not.toHaveBeenCalled();
  });
  it('allows empty lists and serves full details', async () => {
    vi.mocked(bank.getBankList).mockResolvedValue({ items: [], total: 0 });
    expect((await json<ExamBankList>(await list(request('/api/exam/bank')))).data).toEqual({ items: [], total: 0 });
    const response = await detail(request('/api/exam/bank/id'), { params: Promise.resolve({ id: 'id' }) });
    expect((await json<ExamBankItem>(response)).data).toEqual(makeBankItem());
  });
  it('maps missing details to 404 and strips unexpected error details', async () => {
    vi.mocked(bank.getBankItem).mockRejectedValue(new AppError('EXAM_BANK_NOT_FOUND'));
    const response = await detail(request('/api/exam/bank/missing'), { params: Promise.resolve({ id: 'missing' }) });
    expect(response.status).toBe(404); expect((await json(response)).code).toBe('EXAM_BANK_NOT_FOUND');
    vi.mocked(bank.getBankCount).mockRejectedValue(new Error('private vendor stack secret'));
    const failure = await health(request('/api/health')); expect(failure.status).toBe(500);
    expect(await failure.text()).not.toMatch(/private|stack|secret/);
  });
});

describe('essay scoring endpoint', () => {
  it('validates a real result structure, records provider and recomputes word count', async () => {
    vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(makeEssayResult()));
    const response = await essay(request('/api/essay/correct', { ...essayInput, wordCount: 9999 }));
    const body = await json<EssayResult>(response);
    expect(response.status).toBe(200); expect(body.data?.scoreCard.score).toBe(14); expect(body.provider).toBe('deepseek');
    const params = vi.mocked(client.callProvider).mock.calls[0]?.[1];
    expect(JSON.parse(params?.user ?? '{}')).toMatchObject({ wordCount: 3 });
    expect(params?.system).toContain('先定档'); expect(params?.system).toContain('引用原文');
    expect(logger.logRequest).toHaveBeenCalledWith(expect.objectContaining({ wordCount: 3, provider: 'deepseek' }));
    expect(JSON.stringify(vi.mocked(logger.logRequest).mock.calls)).not.toContain(essayInput.essay);
  });
  it.each([['english1', 'big', 17, 5], ['english2', 'big', 15, 5], ['english1', 'small', 10, 5], ['english2', 'small', 8, 4]] as const)('enforces %s/%s scoring', async (type, composition, score, level) => {
    const result = makeEssayResult(); result.scoreCard.score = score; result.scoreCard.band.level = level; result.scoreCard.breakdown = { content: score, language: 0, structure: 0 };
    vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(result));
    expect((await essay(request('/api/essay/correct', { ...essayInput, type, composition }))).status).toBe(200);
  });
  it.each([['english2', 'big'], ['english1', 'small'], ['english2', 'small']] as const)('rejects out-of-range %s/%s model scores', async (type, composition) => {
    const result = makeEssayResult(); result.scoreCard.score = 20; result.scoreCard.band.level = 5; result.scoreCard.breakdown = { content: 10, language: 5, structure: 5 };
    vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(result));
    const response = await essay(request('/api/essay/correct', { ...essayInput, type, composition }));
    expect(response.status).toBe(500); expect((await json(response)).code).toBe('JSON_PARSE_FAILED');
  });
  it('rejects mismatched breakdown totals', async () => {
    const result = makeEssayResult(); result.scoreCard.breakdown.content = 0;
    vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(result));
    expect((await json(await essay(request('/api/essay/correct', essayInput)))).code).toBe('JSON_PARSE_FAILED');
  });
  it.each([{ ...essayInput, essay: ' ' }, { ...essayInput, essay: 'a'.repeat(8001) }, { ...essayInput, prompt: 'x'.repeat(501) }, { ...essayInput, type: 'unknown' }, { ...essayInput, wordCount: 0 }])('rejects invalid essay input without calling LLM', async (input) => {
    const response = await essay(request('/api/essay/correct', input)); expect(response.status).toBe(400); expect(client.callProvider).not.toHaveBeenCalled();
  });
});

describe('structured response and sentence handling', () => {
  it('repairs fenced JSON and returns all seven sentence fields', async () => {
    vi.mocked(client.callProvider).mockResolvedValue('```json\n' + JSON.stringify(makeSentenceResult()) + '\n```');
    const response = await sentence(request('/api/sentence/analyze', sentenceInput));
    expect(response.status).toBe(200); expect((await json<SentenceResult>(response)).data).toEqual(makeSentenceResult());
  });
  it('keeps usable malformed output as text', async () => {
    vi.mocked(client.callProvider).mockResolvedValue('可恢复的分析文本');
    const body = await json<TextFallback>(await sentence(request('/api/sentence/analyze', sentenceInput)));
    expect(body).toEqual({ success: true, data: { text: '可恢复的分析文本' }, provider: 'deepseek' });
  });
  it('rejects parseable but structurally invalid JSON', async () => {
    vi.mocked(client.callProvider).mockResolvedValue('{"translation":"missing fields"}');
    const response = await sentence(request('/api/sentence/analyze', sentenceInput));
    expect(response.status).toBe(500); expect((await json(response)).code).toBe('JSON_PARSE_FAILED');
  });
  it.each(['', '   ', 'a'.repeat(2001)])('rejects empty or excessive sentence input', async (value) => {
    expect((await sentence(request('/api/sentence/analyze', { sentence: value }))).status).toBe(400); expect(client.callProvider).not.toHaveBeenCalled();
  });
  it('maps invalid JSON bodies to 400', async () => {
    const response = await sentence(new Request('http://localhost/api/sentence/analyze', { method: 'POST', headers: { 'x-forwarded-for': `test-${++sequence}` }, body: '{invalid' }));
    expect(response.status).toBe(400); expect((await json(response)).code).toBe('INVALID_INPUT');
  });
  it('switches configured backup on 429 and exposes selected provider', async () => {
    vi.stubEnv('SILICONFLOW_API_KEY', 'backup-test-key');
    vi.mocked(client.callProvider).mockRejectedValueOnce({ status: 429 }).mockResolvedValueOnce(JSON.stringify(makeSentenceResult()));
    const body = await json<SentenceResult>(await sentence(request('/api/sentence/analyze', sentenceInput)));
    expect(body.success).toBe(true); expect(body.provider).toBe('siliconflow'); expect(client.callProvider).toHaveBeenCalledTimes(2);
  });
  it('masks supplier authentication errors', async () => {
    vi.mocked(client.callProvider).mockRejectedValue({ status: 401, message: 'secret vendor credentials' });
    const response = await sentence(request('/api/sentence/analyze', sentenceInput));
    expect(response.status).toBe(500); expect(await response.text()).toBe(JSON.stringify({ success: false, error: '服务暂时不可用，请稍后重试', code: 'ALL_PROVIDERS_FAILED' }));
  });
});

describe('exam analysis with authoritative bank content', () => {
  beforeEach(() => { vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(makeExamData().result)); });
  it('repairs redundant final delimiters and still validates the full exam result', async () => {
    vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(makeExamData().result) + '}');
    const response = await exam(request('/api/exam/analyze', examInput));
    expect(response.status).toBe(200); expect((await json<ExamResult>(response)).data).toEqual(makeExamData().result);
  });
  it('does not let delimiter repair bypass missing result fields', async () => {
    vi.mocked(client.callProvider).mockResolvedValue('{"fullTranslation":null}}');
    const response = await exam(request('/api/exam/analyze', examInput));
    expect(response.status).toBe(500); expect((await json(response)).code).toBe('JSON_PARSE_FAILED');
  });
  it('defaults to the first question and ignores client replacements', async () => {
    const response = await exam(request('/api/exam/analyze', { ...examInput, passage: 'tampered', question: 'tampered', options: ['tampered'], userAnswer: 'B' }));
    expect(response.status).toBe(200);
    const params = vi.mocked(client.callProvider).mock.calls[0]?.[1];
    expect(JSON.parse(params?.user ?? '{}')).toMatchObject({ passage: makeBankItem().passage, question: makeBankItem().questions[0]?.question, referenceAnswer: 'A', userAnswer: 'B' });
    expect((await json<ExamResult>(response)).data?.fullTranslation).toBeNull();
  });
  it('selects a requested question ID', async () => {
    const item = makeBankItem(); item.questions.push({ id: 'q2', question: 'Second question?', options: ['A. No', 'B. Yes'], answer: 'B' });
    vi.mocked(bank.getBankItem).mockResolvedValue(item);
    expect((await exam(request('/api/exam/analyze', { ...examInput, questionId: 'q2' }))).status).toBe(200);
    expect(JSON.parse(vi.mocked(client.callProvider).mock.calls[0]?.[1].user ?? '{}')).toMatchObject({ questionId: 'q2', question: 'Second question?', referenceAnswer: 'B' });
  });
  it.each([{ ...examInput, questionId: 'missing' }, { ...examInput, type: 'english2' }])('rejects invalid bank selection', async (input) => {
    expect((await exam(request('/api/exam/analyze', input))).status).toBe(400); expect(client.callProvider).not.toHaveBeenCalled();
  });
  it('returns missing bank IDs as 404', async () => {
    vi.mocked(bank.getBankItem).mockRejectedValue(new AppError('EXAM_BANK_NOT_FOUND'));
    const response = await exam(request('/api/exam/analyze', examInput)); expect(response.status).toBe(404); expect(client.callProvider).not.toHaveBeenCalled();
  });
  it.each(['paste', 'pdf'])('accepts extracted text with source=%s', async (source) => {
    expect((await exam(request('/api/exam/analyze', { type: 'english1', source, passage: 'Synthetic passage.' }))).status).toBe(200); expect(bank.getBankItem).not.toHaveBeenCalled();
  });
  it.each([{ type: 'english1', source: 'bank' }, { type: 'english1', source: 'paste', passage: ' ' }, { type: 'english1', source: 'pdf' }])('rejects missing source content', async (input) => {
    expect((await exam(request('/api/exam/analyze', input))).status).toBe(400); expect(client.callProvider).not.toHaveBeenCalled();
  });
  it('requires an actual translation only when requested', async () => {
    const input = { type: 'english2', source: 'paste', passage: 'Synthetic passage.', translate: true };
    const failure = await exam(request('/api/exam/analyze', input)); expect((await json(failure)).code).toBe('JSON_PARSE_FAILED');
    const result = makeExamData().result;
    if (!result || !('fullTranslation' in result)) throw new Error('Missing structured fixture');
    result.fullTranslation = '虚构测试文章。'; vi.mocked(client.callProvider).mockResolvedValue(JSON.stringify(result));
    const success = await exam(request('/api/exam/analyze', input)); expect(success.status).toBe(200);
    // translate=false 时即使模型仍返回翻译，也由服务端丢弃并归一化为 null
    const noTranslation = await exam(request('/api/exam/analyze', { ...input, translate: false }));
    expect(noTranslation.status).toBe(200);
    const noTranslationBody = await json(noTranslation) as { data: { fullTranslation: unknown } };
    expect(noTranslationBody.data.fullTranslation).toBeNull();
  });
});

describe('chat SSE contract and follow-up context', () => {
  it('grounds an essay answer and only attaches sources matching streamed citations', async () => {
    vi.mocked(streamWithFallback).mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> {
      yield { type: 'delta', content: '这里要用第三人称单数〔' };
      yield { type: 'delta', content: '1' };
      yield { type: 'delta', content: '〕。〔99〕' };
      yield { type: 'done', provider: 'deepseek' };
    });
    const response = await chat(request('/api/chat', {
      messages: [{ role: 'user', content: 'He go to school 为什么有问题？' }],
      followUp: { kind: 'essay', summary: JSON.stringify({ composition: 'small', prompt: 'Write an invitation' }) },
    }));
    const frames = (await response.text()).trim().split('\n\n').map((frame) => JSON.parse(frame.slice(6)) as ChatStreamEvent);
    expect(frames.filter((event) => event.type === 'delta').map((event) => event.content).join('')).toBe('这里要用第三人称单数〔1〕。');
    expect(frames.at(-1)).toMatchObject({ type: 'done', citations: [{ label: 1, id: 'grammar.subject-verb.v1', example: 'He goes to school.' }] });
    expect(streamWithFallback).toHaveBeenCalledWith(expect.objectContaining({ system: expect.stringContaining('一般现在时的第三人称单数与主谓一致') }), expect.any(Object));
  });

  it('streams deltas followed by done and preserves multi-turn roles', async () => {
    const messages = [...chatInput.messages, { role: 'assistant', content: '先做练习。' }, { role: 'user', content: '为什么？' }];
    const response = await chat(request('/api/chat', { messages, historyId: 'local-history', followUp: { kind: 'essay', summary: '作文评分摘要', dataRef: 'local-ref' } }));
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8'); expect(response.headers.get('Cache-Control')).toBe('no-cache'); expect(response.headers.get('Connection')).toBe('keep-alive');
    const text = await response.text(); const frames = text.trim().split('\n\n').map((frame) => JSON.parse(frame.slice(6)) as ChatStreamEvent);
    expect(frames).toEqual([{ type: 'delta', content: '练习' }, { type: 'delta', content: '很重要。' }, { type: 'done', provider: 'deepseek' }]);
    expect(streamWithFallback).toHaveBeenCalledWith(expect.objectContaining({ messages, system: expect.stringContaining('作文评分摘要') }), expect.any(Object));
  });
  it('returns JSON validation errors before opening the stream', async () => {
    const response = await chat(request('/api/chat', { messages: [] }));
    expect(response.status).toBe(400); expect((await json(response)).code).toBe('INVALID_INPUT'); expect(streamWithFallback).not.toHaveBeenCalled();
  });
  it('sends a friendly SSE error after partial output without a done frame', async () => {
    vi.mocked(streamWithFallback).mockImplementation(async function* (): AsyncGenerator<ChatStreamEvent> { yield { type: 'delta', content: '部分回答' }; throw new AppError('ALL_PROVIDERS_FAILED'); });
    const response = await chat(request('/api/chat', chatInput)); const text = await response.text();
    expect(text).toContain('部分回答'); expect(text).toContain('"type":"error"'); expect(text).toContain('ALL_PROVIDERS_FAILED'); expect(text).not.toContain('"type":"done"');
  });
  it('aborts upstream work when the reader cancels', async () => {
    const response = await chat(request('/api/chat', chatInput)); const reader = response.body!.getReader();
    await reader.read(); await reader.cancel();
    expect(vi.mocked(streamWithFallback).mock.calls[0]?.[0].signal?.aborted).toBe(true);
    expect(logger.logRequest).toHaveBeenCalledTimes(1);
  });
});

describe('OCR upload contract and limits', () => {
  it('preprocesses a valid image before recognition', async () => {
    const original = (await sharp({ create: { width: 2500, height: 20, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
    const response = await ocr(request('/api/ocr', { image: original, mime: 'image/png' }));
    expect(response.status).toBe(200); expect((await json<OcrResult>(response)).data?.confidence).toBe(0.9);
    const sent = vi.mocked(baidu.recognizeHandwriting).mock.calls[0]?.[0] ?? '';
    const metadata = await sharp(Buffer.from(sent, 'base64')).metadata(); expect(metadata.format).toBe('jpeg'); expect(metadata.width).toBe(2000);
  });
  it.each([{ image: 'YWJj', mime: 'image/gif' }, { image: 'YWJj', mime: 'application/pdf' }])('rejects unsupported image types with 415', async (input) => {
    const response = await ocr(request('/api/ocr', input)); expect(response.status).toBe(415); expect((await json(response)).code).toBe('UNSUPPORTED_FILE_TYPE'); expect(baidu.recognizeHandwriting).not.toHaveBeenCalled();
  });
  it('rejects original images larger than 10 MB', async () => {
    const image = Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64');
    const response = await ocr(request('/api/ocr', { image, mime: 'image/png' })); expect(response.status).toBe(413); expect((await json(response)).code).toBe('FILE_TOO_LARGE'); expect(baidu.recognizeHandwriting).not.toHaveBeenCalled();
  });
  it.each([{ image: '', mime: 'image/png' }, { image: 'data:image/png;base64,YWJj', mime: 'image/png' }, { image: 'YWJj' }])('rejects malformed OCR input', async (input) => {
    expect((await ocr(request('/api/ocr', input))).status).toBe(400); expect(baidu.recognizeHandwriting).not.toHaveBeenCalled();
  });
  it('returns a friendly error for damaged images', async () => {
    const response = await ocr(request('/api/ocr', { image: 'YWJj', mime: 'image/png' })); expect(response.status).toBe(500); expect((await json(response)).code).toBe('OCR_FAILED');
  });
  it('maps OCR provider failures to OCR_FAILED', async () => {
    const image = (await sharp({ create: { width: 10, height: 10, channels: 3, background: 'white' } }).png().toBuffer()).toString('base64');
    vi.mocked(baidu.recognizeHandwriting).mockRejectedValue(new AppError('OCR_FAILED'));
    const response = await ocr(request('/api/ocr', { image, mime: 'image/png' })); expect(response.status).toBe(500); expect((await json(response)).code).toBe('OCR_FAILED');
  });
});

describe('rate limits shared across the LLM endpoints', () => {
  it('blocks the 11th LLM request before calling a supplier and includes retry-after', async () => {
    const ip = `limited-${++sequence}`;
    for (let index = 0; index < 10; index++) expect((await sentence(request('/api/sentence/analyze', sentenceInput, ip))).status).toBe(200);
    const response = await essay(request('/api/essay/correct', essayInput, ip));
    expect(response.status).toBe(429); expect((await json(response)).code).toBe('RATE_LIMITED'); expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0); expect(client.callProvider).toHaveBeenCalledTimes(10);
  });
  it('counts invalid attempts and uses a separate OCR bucket', async () => {
    const ip = `ocr-limited-${++sequence}`;
    for (let index = 0; index < 30; index++) expect((await ocr(request('/api/ocr', {}, ip))).status).toBe(400);
    expect((await ocr(request('/api/ocr', {}, ip))).status).toBe(429);
    expect((await sentence(request('/api/sentence/analyze', sentenceInput, ip))).status).toBe(200);
  });
});
