import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { extractEssayPdf } from '@/lib/pdf/essay';
import { makePdf } from './pdf-fixture';
describe('installed PDF renderer for writing', () => {
  it('extracts real text per page', async () => { const result = await extractEssayPdf(new File([makePdf()], 'text.pdf', { type: 'application/pdf' }), false); expect(result).toEqual({ total: 1, pages: [{ number: 1, text: 'Practice reading carefully.' }] }); });
  it('renders a real page into a bounded JPEG for the OCR API', async () => { const result = await extractEssayPdf(new File([makePdf()], 'scan.pdf', { type: 'application/pdf' }), true); const page = result.pages[0]!; expect(page.number).toBe(1); const image = await sharp(Buffer.from(page.image!, 'base64')).metadata(); expect(image.format).toBe('jpeg'); expect(Math.max(image.width!, image.height!)).toBeLessThanOrEqual(2000); });
});
