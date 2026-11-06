import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { verificationReportSchema } from '@/lib/schemas/verification';
import { makeEssayBankItem, makeEssayResult, makeSentenceResult, makeExamData } from './fixtures';

const execute = promisify(execFile);
const marker = 'SYNTHETIC_ANSWER_PRIVATE_DO_NOT_LOG';

async function verify(scenario: string, readonly = false) {
  const parent = path.resolve('.test-tmp'); await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, 'verify-'));
  const reportPath = path.join(directory, 'report.json'); const seen: string[] = [];
  const image = (await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).jpeg().toBuffer()).toString('base64');
  const item = makeEssayBankItem();
  const server = createServer(async (request, response) => {
    const url = request.url ?? '/'; seen.push(url); let body = '';
    for await (const chunk of request) body += String(chunk);
    const json = (data: unknown, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(data)); };
    if (url === '/api/health') return scenario === 'unknown-error' ? json({ success: false, code: marker, error: marker }, 500) : json({ success: true, data: { providers: ['deepseek'], ocr: true, examBankCount: 156 } });
    if (url.startsWith('/api/exam/bank?')) return json({ success: true, data: { total: 4 } });
    if (url === '/api/exam/bank/english1-2019-text1') return json({ success: true, data: { questions: Array(5).fill({}) } });
    if (url.includes('2099')) return json({ success: false, code: 'EXAM_BANK_NOT_FOUND' }, 404);
    if (url.includes('year=invalid')) return json({ success: false, code: 'INVALID_INPUT' }, 400);
    if (url === '/api/essay/bank') return json({ success: true, data: { total: 1, items: [item] } });
    if (url === `/api/essay/bank/${item.id}`) return json({ success: true, data: { ...item, reviewed: scenario !== 'unreviewed' } });
    if (url === '/api/exam/pdf') return scenario === 'pdf-error' ? json({ success: false, code: 'PDF_PARSE_FAILED' }, 400) : json({ success: true, data: { text: 'Practice reading carefully.' } });
    if (url === '/api/essay/pdf') {
      const scan = body.includes('\r\nscan\r\n');
      return json({ success: true, data: { total: 1, pages: [{ number: 1, text: scan ? '' : 'Practice reading carefully.', ...(scan ? { image: scenario === 'bad-image' ? 'bm90IGFuIGltYWdl' : image } : {}) }] } });
    }
    if (url === '/api/essay/correct') {
      if (body.includes('"type":"x"')) return json({ success: false, code: 'INVALID_INPUT' }, 400);
      const result = makeEssayResult(); result.scoreCard.score = 8; result.scoreCard.breakdown = { content: 3, language: 3, structure: 2 };
      if (scenario === 'fractional-sum') result.scoreCard.breakdown.structure += Number.EPSILON * 8;
      if (scenario === 'wrong-sum') result.scoreCard.breakdown.structure += 0.01;
      if (scenario === 'text-fallback') return json({ success: true, data: { text: marker }, provider: 'deepseek' });
      return json({ success: true, data: result, provider: 'deepseek' });
    }
    if (url === '/api/sentence/analyze') return json({ success: true, data: makeSentenceResult(), provider: 'deepseek' });
    if (url === '/api/exam/analyze') return json({ success: true, data: makeExamData().result, provider: 'deepseek' });
    if (url === '/api/route') return json({ success: true, data: { agent: 'sentence', reason: 'Synthetic routing' } });
    if (url === '/api/ocr') return json({ success: true, data: { text: marker, confidence: 1, lowConfidenceWords: [] } });
    if (url === '/api/chat') {
      response.writeHead(200, { 'content-type': scenario === 'wrong-content-type' ? 'application/json' : 'text/event-stream' });
      if (scenario === 'malformed') { response.end(`data: ${marker}\n\n`); return; }
      const delta = { type: 'delta', content: scenario === 'empty-stream' ? '  ' : marker + ' 中文📖 {"type":"error"}' };
      const done = { type: 'done', provider: scenario === 'invalid-provider' ? 'unknown' : 'deepseek' };
      const events = scenario === 'done-only' ? [done] : scenario === 'truncated' ? [delta] : scenario === 'stream-error' ? [delta, { type: 'error', code: 'ALL_PROVIDERS_FAILED', message: marker }] : [delta, done];
      const bytes = Buffer.from(events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join(''));
      // UTF-8 及 CRLF 可以任意分块；报告不得保存回答正文。
      for (const byte of bytes) response.write(Buffer.from([byte]));
      response.end(); return;
    }
    if (url === '/') { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<title>考研</title><script src="/_next/static/synthetic.js"></script>'); return; }
    if (url === '/_next/static/synthetic.js') { response.writeHead(200); response.end('/* synthetic */'); return; }
    json({ success: false, code: 'INTERNAL_ERROR' }, 500);
  });
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Fixture address unavailable');
    const args = ['scripts/verify-deploy.mjs', `http://127.0.0.1:${address.port}`, `--report=${reportPath}`, ...(readonly ? ['--readonly'] : [])];
    const output = await execute(process.execPath, args, { cwd: process.cwd(), timeout: 20_000, windowsHide: true }).then((value) => ({ stdout: value.stdout, exitCode: 0 })).catch((error: unknown) => {
      if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'number' || !('stdout' in error) || typeof error.stdout !== 'string') throw new Error('Verifier process failed');
      return { stdout: error.stdout, exitCode: error.code };
    });
    const raw = await readFile(reportPath, 'utf8'); const report = verificationReportSchema.parse(JSON.parse(raw) as unknown);
    expect(raw).not.toContain(marker); expect(output.stdout).not.toContain(marker);
    return { ...output, report, seen };
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (!path.resolve(directory).startsWith(parent + path.sep)) throw new Error('Unsafe fixture path');
    await rm(directory, { recursive: true, force: true });
  }
}

// Each case runs a child bounded at 20s; allow its startup/cleanup inside the test budget.
describe('acceptance checker catches false positives', { timeout: 25_000 }, () => {
  it('runs local PDF and reviewed writing checks without paid providers in readonly mode', async () => {
    const result = await verify('valid', true); expect(result.exitCode, JSON.stringify(result.report)).toBe(0); expect(result.report.failed).toBe(0);
    expect(result.report.results.map((entry) => entry.name)).toEqual(expect.arrayContaining(['writing.bank', 'writing.detail', 'pdf.extract', 'writing.pdf.text', 'writing.pdf.scan']));
    for (const api of ['/api/ocr', '/api/chat', '/api/route', '/api/sentence/analyze', '/api/exam/analyze']) expect(result.seen).not.toContain(api);
  });
  it('checks an actual delta and terminal provider, not substrings inside an answer', async () => {
    const result = await verify('valid'); expect(result.exitCode, JSON.stringify(result.report)).toBe(0);
    expect(result.report.results.find((entry) => entry.name === 'chat.sse')).toMatchObject({ ok: true, detail: { deltaFrames: 1, provider: 'deepseek' } });
    expect(result.seen.filter((url) => url === '/api/ocr')).toHaveLength(2);
  });
  it('accepts the same numeric tolerance as the production score schema', async () => {
    const result = await verify('fractional-sum'); expect(result.exitCode, JSON.stringify(result.report)).toBe(0);
    expect(result.report.results.find((entry) => entry.name === 'essay.small')).toMatchObject({ ok: true, detail: { format: 'structured' } });
  });
  it.each([
    ['pdf-error', 'pdf.extract'], ['unreviewed', 'writing.detail'], ['bad-image', 'writing.pdf.scan'],
    ['done-only', 'chat.sse'], ['empty-stream', 'chat.sse'], ['truncated', 'chat.sse'],
    ['stream-error', 'chat.sse'], ['invalid-provider', 'chat.sse'], ['wrong-content-type', 'chat.sse'],
    ['unknown-error', 'health'], ['malformed', 'chat.sse'], ['wrong-sum', 'essay.small'], ['text-fallback', 'essay.small'],
  ])('fails %s instead of reporting a healthy release', async (scenario, failedCheck) => {
    const result = await verify(scenario); expect(result.exitCode).toBe(1);
    expect(result.report.results.find((entry) => entry.name === failedCheck)?.ok).toBe(false);
  });
});
