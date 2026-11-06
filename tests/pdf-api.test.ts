import { beforeEach, describe, expect, it, vi } from 'vitest';
const parser = vi.hoisted(() => ({ getText: vi.fn(), destroy: vi.fn(), construct: vi.fn() }));
vi.mock('pdf-parse', () => ({ PDFParse: class { constructor(options: unknown) { parser.construct(options); } getText = parser.getText; destroy = parser.destroy; } }));
vi.mock('@/lib/utils/logger', () => ({ logRequest: vi.fn() }));
import { POST } from '@/app/api/exam/pdf/route';
import { PDF_MAX_BYTES } from '@/lib/schemas/exam';

function upload(file: Blob | string = new Blob(['%PDF-1.4 mock'], { type: 'application/pdf' })): Request {
  const body = new FormData(); if (typeof file === 'string') body.set('file', file); else body.set('file', file, 'test.pdf');
  return new Request('http://local/api/exam/pdf', { method: 'POST', body });
}
beforeEach(() => { parser.getText.mockResolvedValue({ text: ' A synthetic passage. ' }); parser.destroy.mockResolvedValue(undefined); });
describe('PDF upload API', () => {
  it('returns editable text without analyzing or storing it', async () => {
    const response = await POST(upload());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { text: 'A synthetic passage.' } });
    expect(parser.construct).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Uint8Array), verbosity: 0, isEvalSupported: false }));
    expect(parser.destroy).toHaveBeenCalledOnce();
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it.each(['password required', 'damaged PDF internal path'])('sanitizes parser failure: %s', async (message) => {
    parser.getText.mockRejectedValueOnce(new Error(message)); const response = await POST(upload());
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ success: false, code: 'PDF_PARSE_FAILED' });
    expect(parser.destroy).toHaveBeenCalledOnce();
  });
  it('rejects empty extraction', async () => { parser.getText.mockResolvedValueOnce({ text: ' \n ' }); expect((await POST(upload())).status).toBe(400); });
  it('rejects oversized files before parsing', async () => { const response = await POST(upload(new Blob([new Uint8Array(PDF_MAX_BYTES + 1)], { type: 'application/pdf' }))); expect(response.status).toBe(413); expect(parser.construct).not.toHaveBeenCalled(); });
  it('rejects unsupported types', async () => { expect((await POST(upload(new Blob(['text'], { type: 'text/plain' })))).status).toBe(415); expect(parser.construct).not.toHaveBeenCalled(); });
  it('rejects a fake PDF signature', async () => { const response = await POST(upload(new Blob(['not a pdf'], { type: 'application/pdf' }))); expect(response.status).toBe(400); expect(parser.construct).not.toHaveBeenCalled(); });
  it('rejects non-file fields', async () => { expect((await POST(upload('fake'))).status).toBe(400); });
  it('rejects malformed multipart bodies', async () => { expect((await POST(new Request('http://local/api/exam/pdf', { method: 'POST', body: 'broken' }))).status).toBe(400); });
});
