import { describe, expect, it } from 'vitest';
import { extractPdfText } from '@/lib/pdf/extract';
import { makePdf } from './pdf-fixture';

describe('installed PDF parser', () => {
  it('extracts a real synthetic PDF and omits page markers', async () => {
    const file = new File([makePdf()], 'practice.pdf', { type: 'application/pdf' });
    expect(await extractPdfText(file)).toEqual({ text: 'Practice reading carefully.' });
  });
  it('rejects a real PDF with no selectable text', async () => {
    const file = new File([makePdf('')], 'blank.pdf', { type: 'application/pdf' });
    await expect(extractPdfText(file)).rejects.toMatchObject({ code: 'PDF_PARSE_FAILED' });
  });
});
