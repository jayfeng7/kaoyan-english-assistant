import { it, expect } from 'vitest';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { publicEvalMaterialSchema } from '@/lib/schemas/public-evaluation';
import { apiResponseSchema, ocrResultSchema } from '@/lib/schemas/common';
import { essayPdfExtractResultSchema } from '@/lib/schemas/essay-bank';
import { pdfTextResultSchema } from '@/lib/schemas/exam';
import { characterErrorRate, normalizeOcrText } from '@/lib/evaluation/metrics';
import type { PublicFileEvalRecord } from '@/types';

it('evaluates downloaded public files, keeping protocol success separate from provisional OCR accuracy', async () => {
  if (process.env.EVAL_LIVE !== '1') throw new Error('EVAL_LIVE=1 is required for real OCR requests.');
  const base = process.env.EVAL_BASE ?? 'http://127.0.0.1:3110'; if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Isolated local candidate required.');
  const directory = path.resolve('artifacts/launch-acceptance-20261020/materials');
  const materials = z.array(publicEvalMaterialSchema).parse(JSON.parse(await readFile('data/evaluation/public-materials.json', 'utf8')));
  const results: PublicFileEvalRecord[] = [];
  for (const material of materials) {
    const row: PublicFileEvalRecord = { caseId: material.id, protocolStatus: 'fail', shaValid: false, referenceStatus: material.referenceStatus, accuracyAccepted: false, issueCodes: [] };
    try {
      const bytes = await readFile(path.join(directory, material.file)); row.shaValid = createHash('sha256').update(bytes).digest('hex') === material.sha256;
      if (!row.shaValid) { row.issueCodes.push('hash_mismatch'); results.push(row); continue; }
      if (material.mime === 'application/pdf') {
        const form = new FormData(); form.set('file', new Blob([bytes], { type: material.mime }), material.file); form.set('mode', 'auto');
        const response = await fetch(base + '/api/essay/pdf', { method: 'POST', body: form, signal: AbortSignal.timeout(90_000) });
        const parsed = apiResponseSchema(essayPdfExtractResultSchema).parse(await response.json()); if (!response.ok || !parsed.success || !parsed.data || parsed.data.total !== material.expectedPages) throw new Error('EVAL_PDF_FAILED');
        row.pages = parsed.data.total; row.textPages = parsed.data.pages.filter((page) => page.text.trim()).length; row.imagePages = parsed.data.pages.filter((page) => page.image).length;
        for (const page of parsed.data.pages) if (page.image) {
          const ocr = await fetch(base + '/api/ocr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: page.image, mime: 'image/jpeg' }), signal: AbortSignal.timeout(90_000) });
          const data = apiResponseSchema(ocrResultSchema).parse(await ocr.json()); if (!ocr.ok || !data.success || !data.data) throw new Error('EVAL_OCR_FAILED'); row.ocrCharacters = (row.ocrCharacters ?? 0) + data.data.text.length;
        }
        if (material.id === 'P01') {
          const second = new FormData(); second.set('file', new Blob([bytes], { type: material.mime }), material.file);
          const response = await fetch(base + '/api/exam/pdf', { method: 'POST', body: second, signal: AbortSignal.timeout(90_000) });
          const data = apiResponseSchema(pdfTextResultSchema).parse(await response.json()); if (!response.ok || !data.success) throw new Error('EVAL_TEXT_PDF_FAILED');
        }
      } else {
        const response = await fetch(base + '/api/ocr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: bytes.toString('base64'), mime: material.mime }), signal: AbortSignal.timeout(90_000) });
        const data = apiResponseSchema(ocrResultSchema).parse(await response.json()); if (!response.ok || !data.success || !data.data) throw new Error('EVAL_IMAGE_FAILED');
        row.ocrCharacters = data.data.text.length;
        if (material.reference) { row.cer = characterErrorRate(material.reference, data.data.text); row.normalizedCer = characterErrorRate(normalizeOcrText(material.reference), normalizeOcrText(data.data.text)); }
      }
      row.protocolStatus = 'pass';
    } catch { row.issueCodes.push('file_or_api_failed'); }
    results.push(row); process.stdout.write(JSON.stringify(row) + '\n');
  }
  const report = { at: new Date().toISOString(), base, inputs: materials.length, results, allProtocolsPassed: results.every((row) => row.protocolStatus === 'pass'), accuracyAccepted: false, note: 'AI visual transcripts are provisional; these public samples do not establish student-essay or teacher accuracy.' };
  const output = path.resolve('artifacts/launch-acceptance-20261020'); await mkdir(output, { recursive: true }); await writeFile(path.join(output, `public-files-${Date.now()}.json`), JSON.stringify(report, null, 2) + '\n');
  expect(report.allProtocolsPassed, 'Keep original failures; see metadata report.').toBe(true);
}, 600_000);
