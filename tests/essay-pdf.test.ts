import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
const parser = vi.hoisted(() => ({ getInfo: vi.fn(), getText: vi.fn(), getScreenshot: vi.fn(), destroy: vi.fn(), construct: vi.fn() }));
vi.mock('pdf-parse', () => ({ PDFParse: class { constructor(options: unknown) { parser.construct(options); } getInfo = parser.getInfo; getText = parser.getText; getScreenshot = parser.getScreenshot; destroy = parser.destroy; } }));
vi.mock('@/lib/utils/logger', () => ({ logRequest: vi.fn() }));
vi.mock('@/lib/ocr/baidu', () => ({ recognizeHandwriting: vi.fn() }));
import { POST } from '@/app/api/essay/pdf/route';
import { recognizeHandwriting } from '@/lib/ocr/baidu';
import { AppError } from '@/lib/utils/errors';
import { checkRateLimit } from '@/lib/utils/rate-limit';
import { ESSAY_PDF_MAX_BYTES, essayPdfExtractResultSchema } from '@/lib/schemas/essay-bank';
let sequence = 0;
function upload(mode = 'auto', file: Blob | string = new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' }), recognize?: string, signal?: AbortSignal, ip = `pdf-test-${++sequence}`): Request { const body = new FormData(); if (typeof file === 'string') body.set('file', file); else body.set('file', file, 'test.pdf'); body.set('mode', mode); if (recognize !== undefined) body.set('recognize', recognize); return new Request('http://local/api/essay/pdf', { method: 'POST', body, signal, headers: { 'x-forwarded-for': ip } }); }
beforeEach(async () => {
  parser.getInfo.mockResolvedValue({ total: 2, pages: [{ pageNumber: 1, width: 600, height: 800 }, { pageNumber: 2, width: 600, height: 800 }] });
  parser.getText.mockResolvedValue({ pages: [{ num: 1, text: 'First page.' }, { num: 2, text: '' }] });
  const data = await sharp({ create: { width: 20, height: 20, channels: 3, background: 'white' } }).png().toBuffer();
  parser.getScreenshot.mockResolvedValue({ pages: [{ data }] }); parser.destroy.mockResolvedValue(undefined);
  vi.mocked(recognizeHandwriting).mockResolvedValue({ text: 'Scanned text.', confidence: 0.4, lowConfidenceWords: [{ word: 'Scanned', confidence: 0.4, start: 0, end: 7 }] });
});
describe('writing PDF preparation API', () => {
  it('recognizes scan pages on the server without returning image data and keeps ordered OCR confidence', async () => {
    const response = await POST(upload('auto', undefined, 'true')); const body = await response.json();
    expect(response.status).toBe(200); expect(body.data.pages.map((p: { method: string }) => p.method)).toEqual(['text', 'ocr']);
    expect(body.data.pages[1].ocr.lowConfidenceWords).toEqual([{ word: 'Scanned', confidence: 0.4, start: 0, end: 7 }]); expect(JSON.stringify(body)).not.toContain('"image"');
    expect(recognizeHandwriting).toHaveBeenCalledOnce();
    const [image, signal] = vi.mocked(recognizeHandwriting).mock.calls[0]!;
    expect((await sharp(Buffer.from(image, 'base64')).metadata()).format).toBe('jpeg'); expect(signal).toBeInstanceOf(AbortSignal);
  });
  it('keeps scan mode explicit and rejects malformed recognition flags', async () => {
    expect((await POST(upload('scan', undefined, 'true'))).status).toBe(200); expect(recognizeHandwriting).toHaveBeenCalledTimes(2); expect(parser.getText).not.toHaveBeenCalled();
    expect((await POST(upload('scan', undefined, 'yes'))).status).toBe(400);
  });
  it('does not invoke OCR for text-only pages', async () => {
    parser.getText.mockResolvedValueOnce({ pages: [{ num: 1, text: 'One.' }, { num: 2, text: 'Two.' }] });
    const response = await POST(upload('auto', undefined, 'true')); expect(response.status).toBe(200); expect(recognizeHandwriting).not.toHaveBeenCalled();
  });
  it('does not expose partial results when a later page fails', async () => {
    vi.mocked(recognizeHandwriting).mockResolvedValueOnce({ text: 'First.', confidence: 0.9, lowConfidenceWords: [] }).mockRejectedValueOnce(new AppError('OCR_FAILED'));
    const response = await POST(upload('scan', undefined, 'true')); const body = await response.json();
    expect(response.status).toBe(500); expect(body.code).toBe('OCR_FAILED'); expect(body.data).toBeUndefined(); expect(parser.destroy).toHaveBeenCalledOnce();
  });
  it('stops before the next OCR page when the client cancels', async () => {
    const controller = new AbortController();
    vi.mocked(recognizeHandwriting).mockImplementationOnce(async () => { controller.abort(); return { text: 'First.', confidence: 0.9, lowConfidenceWords: [] }; });
    const response = await POST(upload('scan', undefined, 'true', controller.signal)); expect(response.ok).toBe(false); expect(recognizeHandwriting).toHaveBeenCalledOnce(); expect(parser.destroy).toHaveBeenCalledOnce();
  });
  it('charges the same OCR bucket once per scan page and returns Retry-After before another vendor call', async () => {
    const ip = `pdf-quota-${++sequence}`;
    for (let index = 0; index < 29; index++) expect(checkRateLimit(ip, 'ocr').allowed).toBe(true);
    const response = await POST(upload('scan', undefined, 'true', undefined, ip)); expect(response.status).toBe(429); expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect((await response.json()).data).toBeUndefined(); expect(recognizeHandwriting).toHaveBeenCalledOnce();
  });
  it('releases the PDF renderer and stops before another page on cancellation', async () => {
    const controller = new AbortController();
    parser.getScreenshot.mockImplementationOnce(async () => { controller.abort(); return { pages: [] }; });
    const response = await POST(upload('scan', undefined, 'true', controller.signal));
    expect(response.ok).toBe(false); expect(parser.getScreenshot).toHaveBeenCalledOnce(); expect(parser.destroy).toHaveBeenCalledOnce(); expect(recognizeHandwriting).not.toHaveBeenCalled();
  });
  it('preserves mixed page order and prepares only scan pages for existing OCR', async () => {
    const response = await POST(upload()); const body = await response.json(); expect(response.status).toBe(200);
    expect(body.data.pages[0]).toEqual({ number: 1, text: 'First page.' }); expect(body.data.pages[1]).toMatchObject({ number: 2, text: '', image: expect.any(String) });
    expect(essayPdfExtractResultSchema.safeParse(body.data).success).toBe(true); expect(parser.getScreenshot).toHaveBeenCalledOnce(); expect(parser.destroy).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('allows explicit whole-page OCR so handwritten areas in mixed pages are not omitted', async () => {
    const response = await POST(upload('scan')); expect(response.status).toBe(200); expect(parser.getText).not.toHaveBeenCalled(); expect(parser.getScreenshot).toHaveBeenCalledTimes(2);
    expect(parser.getScreenshot.mock.calls.every(([options]) => options.scale <= 2 && options.partial.length === 1)).toBe(true);
  });
  it.each([0,6,100])('rejects %s pages before extracting or rendering', async (total) => { parser.getInfo.mockResolvedValueOnce({ total, pages: [] }); expect((await POST(upload())).status).toBe(400); expect(parser.getText).not.toHaveBeenCalled(); expect(parser.getScreenshot).not.toHaveBeenCalled(); expect(parser.destroy).toHaveBeenCalledOnce(); });
  it('accepts exactly five ordered text pages', async () => { parser.getInfo.mockResolvedValueOnce({ total: 5, pages: [] }); parser.getText.mockResolvedValueOnce({ pages: Array.from({length:5}, (_,index) => ({ num: index+1, text: `Synthetic page ${index+1}.` })) }); const response = await POST(upload()); expect(response.status).toBe(200); const body = await response.json(); expect(body.data.pages).toHaveLength(5); expect(parser.getScreenshot).not.toHaveBeenCalled(); });
  it('rejects invalid types/signatures/sizes/fields before constructing a parser', async () => {
    for (const [file,status] of [[new Blob(['x'],{type:'text/plain'}),415],[new Blob(['x'],{type:'application/pdf'}),400],[new Blob([new Uint8Array(ESSAY_PDF_MAX_BYTES+1)],{type:'application/pdf'}),413],['fake',400]] as const) expect((await POST(upload('auto',file))).status).toBe(status);
    expect((await POST(upload('wrong'))).status).toBe(400); expect(parser.construct).not.toHaveBeenCalled();
  });
  it.each(['getInfo','getText','getScreenshot'] as const)('sanitizes %s failures and releases the parser', async (method) => { parser[method].mockRejectedValueOnce(new Error('private internal secret')); const response = await POST(upload()); expect(response.status).toBe(400); expect(await response.text()).not.toContain('secret'); expect(parser.destroy).toHaveBeenCalledOnce(); });
  it('rejects malformed page order at the response boundary', () => { expect(essayPdfExtractResultSchema.safeParse({total:2,pages:[{number:2,text:'a'},{number:1,text:'b'}]}).success).toBe(false); });
});
