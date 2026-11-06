// 部署后自检脚本：对任意 BASE 地址执行接口验收
// 用法：
//   node scripts/verify-deploy.mjs                          # 本机 http://127.0.0.1:3102 全量（会真实调用 LLM/OCR）
//   node scripts/verify-deploy.mjs https://xxx.trycloudflare.com
//   node scripts/verify-deploy.mjs http://127.0.0.1:3105 --readonly # 健康/题库/静态/错误码/PDF，不消耗额度
//   node scripts/verify-deploy.mjs http://127.0.0.1:3000 --readonly --allow-empty-bank --allow-no-ocr
// --readonly 不调用 LLM/OCR，仍执行本地 PDF 解析；不启动服务或隧道。
// --allow-empty-bank 允许干净开源安装没有第三方题库；仍验证接口契约与空状态。
// --allow-no-ocr 允许未配置百度 OCR 的纯文字部署；非只读模式下仍会因 OCR 功能失败。
// --report=路径 可独立保存报告；只记录状态与指标，不记录输入/回答正文。
// 输出：控制台表格 + artifacts/verify-deploy.json；任一失败退出码 1。

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const readonly = args.includes('--readonly');
const allowEmptyBank = args.includes('--allow-empty-bank');
const allowNoOcr = args.includes('--allow-no-ocr');
const baseArg = args.find((a) => /^https?:\/\//.test(a));
const BASE = (baseArg || process.env.BASE || 'http://127.0.0.1:3102').replace(/\/$/, '');
const results = [];
const startedAt = Date.now();
const reportPath = args.find((arg) => arg.startsWith('--report='))?.slice('--report='.length) || 'artifacts/verify-deploy.json';
const deadline = () => AbortSignal.timeout(200_000);
const PDF_TEXT = 'Practice reading carefully.';
const ERROR_CODES = ['INVALID_INPUT', 'FILE_TOO_LARGE', 'UNSUPPORTED_FILE_TYPE', 'RATE_LIMITED', 'PDF_PARSE_FAILED', 'OCR_FAILED', 'ALL_PROVIDERS_FAILED', 'JSON_PARSE_FAILED', 'EXAM_BANK_NOT_FOUND', 'INTERNAL_ERROR'];

// 固定合成材料，不依赖未提交的原始试卷或 artifacts。
function practicePdf() {
  const stream = `BT /F1 12 Tf 72 720 Td (${PDF_TEXT}) Tj ET`;
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`];
  let pdf = '%PDF-1.4\n'; const offsets = [];
  for (const [index, object] of objects.entries()) { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
function pdfForm(mode) {
  const form = new FormData(); form.set('file', new Blob([practicePdf()], { type: 'application/pdf' }), 'synthetic-practice.pdf');
  if (mode) form.set('mode', mode);
  return { method: 'POST', body: form };
}

function record(name, ok, status, ms, detail) {
  results.push({ name, ok, status, ms, detail });
  const flag = ok ? 'PASS' : 'FAIL';
  console.log(`${flag}  ${String(status).padEnd(4)} ${String(ms).padStart(6)}ms  ${name}${detail ? '  ' + JSON.stringify(detail).slice(0, 120) : ''}`);
}

const post = (body) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function json(name, apiPath, init, check, inspect) {
  const t = Date.now();
  try {
    const res = await fetch(BASE + apiPath, { ...init, signal: deadline() });
    const body = await res.json().catch(() => ({}));
    const detail = body.success === false ? { code: ERROR_CODES.includes(body.code) ? body.code : 'UNEXPECTED_ERROR' } : inspect?.(body);
    record(name, Boolean(await check(res.status, body)), res.status, Date.now() - t, detail);
    return body;
  } catch (e) {
    record(name, false, 0, Date.now() - t, { error: 'REQUEST_OR_RESPONSE_FAILED' });
    return null;
  }
}

async function sse(name, body) {
  const t = Date.now();
  let reader;
  try {
    const res = await fetch(BASE + '/api/chat', { ...post(body), signal: deadline() });
    if (!res.ok || !res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
      record(name, false, res.status, Date.now() - t);
      return;
    }
    reader = res.body.getReader();
    const decoder = new TextDecoder();
    let firstMs, chunks = 0, buffer = '', deltaFrames = 0, characters = 0, terminal = false, provider;
    const frame = (text) => {
      const data = text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
      if (!data) return;
      const event = JSON.parse(data);
      if (event?.type === 'delta' && typeof event.content === 'string') {
        deltaFrames++; characters += event.content.trim().length;
        if (event.content.trim() && firstMs === undefined) firstMs = Date.now() - t;
      } else if (event?.type === 'done' && ['deepseek', 'siliconflow', 'openrouter'].includes(event.provider)) {
        terminal = true; provider = event.provider;
      } else throw new Error('INVALID_SSE_EVENT');
    };
    while (!terminal) {
      const { done, value } = await reader.read();
      if (value?.length) chunks++;
      buffer += decoder.decode(value, { stream: !done }); buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0 && !terminal) { frame(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); boundary = buffer.indexOf('\n\n'); }
      if (done) { if (buffer.trim() && !terminal) frame(buffer); break; }
    }
    record(name, terminal && deltaFrames > 0 && characters > 0, res.status, Date.now() - t, { chunks, deltaFrames, characters, firstMs, provider });
  } catch (e) {
    record(name, false, 0, Date.now() - t, { error: 'SSE_FAILED' });
  }
  finally { if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); } }
}

const isSuccess = (s, b) => s === 200 && b?.success === true;

// ---------- 1. 只读部分 ----------
const health = await json('health', '/api/health', {}, isSuccess);
if (health?.data) {
  record('health.providers', health.data.providers?.length >= 1, 200, 0, { providers: health.data.providers, ocr: health.data.ocr, bank: health.data.examBankCount });
  record('health.ocr', allowNoOcr || health.data.ocr === true, 200, 0, { configured: health.data.ocr === true, allowedMissing: allowNoOcr });
  record('health.bank', allowEmptyBank ? Number.isInteger(health.data.examBankCount) && health.data.examBankCount >= 0 : health.data.examBankCount >= 100, 200, 0, { count: health.data.examBankCount, allowEmpty: allowEmptyBank });
}

if (allowEmptyBank) {
  await json('bank.list.empty', '/api/exam/bank?type=english1&year=2019', {}, (s, b) => isSuccess(s, b) && Number.isInteger(b.data.total) && Array.isArray(b.data.items) && b.data.items.length === b.data.total);
} else {
  await json('bank.list', '/api/exam/bank?type=english1&year=2019', {}, (s, b) => isSuccess(s, b) && b.data.total === 4);
  await json('bank.detail', '/api/exam/bank/english1-2019-text1', {}, (s, b) => isSuccess(s, b) && b.data.questions.length === 5);
}
await json('bank.404', '/api/exam/bank/english1-2099-text9', {}, (s, b) => s === 404 && b.code === 'EXAM_BANK_NOT_FOUND');
await json('input.400', '/api/essay/correct', post({ type: 'x', composition: 'big', prompt: '', essay: '' }), (s, b) => s === 400 && b.code === 'INVALID_INPUT');

// 仅检查正式已复核题目，不访问 drafts。
const writing = await json('writing.bank', '/api/essay/bank', {}, (s, b) => isSuccess(s, b) && Number.isInteger(b.data.total) && Array.isArray(b.data.items) && b.data.items.length === b.data.total && (allowEmptyBank || b.data.total > 0), (b) => ({ total: b?.data?.total }));
const writingItem = writing?.data?.items?.[0];
if (writingItem?.id) await json('writing.detail', '/api/essay/bank/' + encodeURIComponent(writingItem.id), {}, (s, b) => isSuccess(s, b) && b.data.id === writingItem.id && b.data.reviewed === true && Boolean(b.data.directions?.trim()));
await json('writing.year.400', '/api/essay/bank?year=invalid', {}, (s, b) => s === 400 && b.code === 'INVALID_INPUT');
await json('writing.404', '/api/essay/bank/english1-2099-big', {}, (s, b) => s === 404 && b.code === 'EXAM_BANK_NOT_FOUND');
await json('pdf.extract', '/api/exam/pdf', pdfForm(), (s, b) => isSuccess(s, b) && b.data.text?.trim() === PDF_TEXT);
await json('writing.pdf.text', '/api/essay/pdf', pdfForm('auto'), (s, b) => isSuccess(s, b) && b.data.total === 1 && b.data.pages?.length === 1 && b.data.pages[0].number === 1 && b.data.pages[0].text?.trim() === PDF_TEXT && b.data.pages[0].image === undefined);
const scan = await json('writing.pdf.scan', '/api/essay/pdf', pdfForm('scan'), async (s, b) => {
  if (!isSuccess(s, b) || b.data.total !== 1 || b.data.pages?.length !== 1 || b.data.pages[0].number !== 1 || b.data.pages[0].text !== '' || typeof b.data.pages[0].image !== 'string') return false;
  const sharp = (await import('sharp')).default;
  const image = await sharp(Buffer.from(b.data.pages[0].image, 'base64')).metadata();
  return image.format === 'jpeg' && image.width > 0 && image.height > 0 && Math.max(image.width, image.height) <= 2000;
});

// 首页与静态资源
{
  const t = Date.now();
  try {
    const res = await fetch(BASE + '/', { signal: deadline() });
    const html = await res.text();
    const asset = html.match(/\/_next\/static\/[^"']+?\.js/)?.[0];
    let assetOk = false;
    if (asset) assetOk = (await fetch(BASE + asset, { signal: deadline() })).ok;
    record('web.home', res.ok && html.includes('考研'), res.status, Date.now() - t, { asset });
    record('web.asset', assetOk, assetOk ? 200 : 0, 0);
  } catch (e) {
    record('web.home', false, 0, Date.now() - t, { error: 'WEB_FAILED' });
  }
}

if (!readonly) {
  // ---------- 2. 真实 AI 链路 ----------
  await json('essay.small', '/api/essay/correct', post({
    type: 'english2', composition: 'small',
    prompt: 'Suppose you are a student who wants to join the university volunteer program. Write an email to the coordinator, Mr. Smith, to apply for it. Do not sign your own name.',
    essay: 'Dear Mr. Smith,\nI am Li Ming, a sophomore from the School of Foreign Languages. I am writing to apply for the volunteer program of our university.\nI have a strong passion for public service. Last year, I worked as a volunteer in the city library, where I helped organize reading activities for children. In addition, I am good at English and communication, which enables me to serve foreign visitors.\nI would appreciate it if you could give me a chance. I am looking forward to your reply.\nYours sincerely,\nLi Ming'
  }), (s, b) => {
    const d = b?.data;
    return isSuccess(s, b) && !!d?.scoreCard && d.scoreCard.score <= 10 &&
      Math.abs(d.scoreCard.breakdown.content + d.scoreCard.breakdown.language + d.scoreCard.breakdown.structure - d.scoreCard.score) <= 0.000001;
  }, (b) => ({ format: typeof b?.data?.text === 'string' ? 'text_fallback' : b?.data?.scoreCard ? 'structured' : 'unknown' }));

  await json('sentence', '/api/sentence/analyze', post({
    sentence: 'The fact that so many people are willing to pay for information they can get for free suggests that what they are really buying is convenience.'
  }), (s, b) => isSuccess(s, b) && Array.isArray(b.data?.segments) && !!b.data?.translation);

  await json('exam.bank', '/api/exam/analyze', post({
    type: 'english1', source: 'bank', bankId: 'english1-2019-text1', questionId: 'english1-2019-text1-q22', translate: false
  }), (s, b) => isSuccess(s, b) && !!b.data?.questionAnalysis?.answer && b.data.fullTranslation === null,
  (b) => ({ format: typeof b?.data?.text === 'string' ? 'text_fallback' : b?.data?.questionAnalysis ? 'structured' : 'unknown' }));

  await json('route', '/api/route', post({ input: '请帮我分析这句话的结构：The book that you gave me is interesting.' }),
    (s, b) => isSuccess(s, b) && ['essay', 'sentence', 'exam', 'chat'].includes(b.data?.agent));

  await sse('chat.sse', { messages: [{ role: 'user', content: '请用三句话说明考研英语小作文的格式要点。' }] });

  // OCR：合成图片
  try {
    const sharp = (await import('sharp')).default;
    const svg = `<svg width="900" height="260" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><text x="40" y="110" font-family="Segoe Script, cursive" font-size="46" fill="#111">Dear Mr Smith I am writing</text><text x="40" y="190" font-family="Segoe Script, cursive" font-size="46" fill="#111">to apply for the volunteer job</text></svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    await json('ocr', '/api/ocr', post({ image: buf.toString('base64'), mime: 'image/png' }),
      (s, b) => isSuccess(s, b) && typeof b.data?.text === 'string');
  } catch (e) {
    record('ocr', false, 0, 0, { error: 'SYNTHETIC_IMAGE_FAILED' });
  }

  if (scan?.data?.pages?.[0]?.image) await json('writing.pdf.ocr', '/api/ocr', post({ image: scan.data.pages[0].image, mime: 'image/jpeg' }), (s, b) => isSuccess(s, b) && typeof b.data.text === 'string' && Boolean(b.data.text.trim()));
}

const summary = {
  base: BASE,
  mode: readonly ? 'readonly' : 'full',
  total: results.length,
  passed: results.filter((r) => r.ok).length,
  failed: results.filter((r) => !r.ok).length,
  elapsedMs: Date.now() - startedAt,
  at: new Date().toISOString(),
  results
};

try {
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(path.resolve(reportPath), JSON.stringify(summary, null, 2));
} catch {
  /* 只读环境下忽略写盘失败 */
}

console.log(`\n${summary.mode} @ ${summary.base}: ${summary.passed}/${summary.total} passed, ${summary.elapsedMs}ms`);
process.exit(summary.failed === 0 ? 0 : 1);
