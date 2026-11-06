import { describe, expect, it } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { createEssayPdf } from '@/lib/pdf/essay-report';
import { essayParagraphs, reflowEssay } from '@/lib/utils/essay-layout';
import { POST } from '@/app/api/essay/report/route';
import { makeEssayData } from './fixtures';

describe('essay layout preserves writing', () => {
  it('reflows OCR lines across the full width while preserving paragraphs and original mistakes', () => {
    const original = 'The chart shows a survey on\ncare robots. He go to school.\n\nAnother paragraph has intelli-\ngent devices.';
    const text = reflowEssay(original);
    expect(essayParagraphs(original)).toHaveLength(2);
    expect(text).toContain('survey on care robots. He go');
    expect(text.replace(/\s/g, '')).toBe(original.replace(/\s/g, ''));
    expect(reflowEssay(text)).toBe(text);
  });
  it('keeps letter salutations, closing and signature separate', () => {
    expect(essayParagraphs('Dear Alex,\nI write to invite\nyou.\nYours sincerely,\nLi Ming')).toEqual(['Dear Alex,','I write to invite you.','Yours sincerely,','Li Ming']);
  });
});

describe('direct report PDF export', () => {
  it('exports selectable Chinese, the same score, complete long text, and numbered pages without raw OCR or chat', async () => {
    const record = makeEssayData();
    record.essay = 'Learning takes practice.\nHe go to school.\n\n' + 'This is a complete paragraph about careful practice. '.repeat(115) + '\n\nEND_OF_ORIGINAL';
    record.ocrResult = { text: 'PRIVATE_RAW_OCR', confidence: .7, lowConfidenceWords: [] };
    record.followUps = [{ id:record.id,role:'user',content:'PRIVATE_FOLLOWUP',createdAt:100,status:'done' }];
    const before = JSON.stringify(record);
    const bytes = await createEssayPdf(record);
    expect(Buffer.from(bytes).subarray(0,5).toString()).toBe('%PDF-');
    const parser = new PDFParse({ data: bytes, verbosity: 0, isEvalSupported: false });
    try {
      const output = await parser.getText({ pageJoiner:'\n' });
      expect(output.total).toBeGreaterThan(1);
      for (const value of ['作文批改报告','14 / 20','总评','He go to school.','END_OF_ORIGINAL','规律练习']) expect(output.text).toContain(value);
      expect(output.text.indexOf('14 / 20')).toBeLessThan(output.text.indexOf('题目与要求'));
      expect(output.text).not.toContain('PRIVATE_RAW_OCR'); expect(output.text).not.toContain('PRIVATE_FOLLOWUP');
      expect(output.pages.every(page => /\d+\s*\/\s*\d+/.test(page.text))).toBe(true);
    } finally { await parser.destroy(); }
    expect(JSON.stringify(record)).toBe(before);
  }, 20_000);
  it('does not invent a score for unfinished feedback', async () => {
    const record = { ...makeEssayData(), result:{text:'已有反馈，没有完成评分。'} };
    const parser = new PDFParse({ data:await createEssayPdf(record),verbosity:0,isEvalSupported:false });
    try { const output=await parser.getText(); expect(output.text).toContain('尚未完成有效评分'); expect(output.text).not.toContain('14 / 20'); } finally { await parser.destroy(); }
  });
  it('returns a PDF attachment and rejects missing results or oversized actual request streams', async () => {
    const request = (body:string) => new Request('http://localhost/api/essay/report',{method:'POST',headers:{'Content-Type':'application/json'},body});
    const valid = await POST(request(JSON.stringify({record:makeEssayData()})));
    expect(valid.status).toBe(200); expect(valid.headers.get('Content-Disposition')).toContain('attachment'); expect(valid.headers.get('Content-Type')).toBe('application/pdf'); expect(valid.headers.get('Cache-Control')).toContain('no-store');
    const noResult={...makeEssayData(),result:undefined};
    expect((await POST(request(JSON.stringify({record:noResult})))).status).toBe(400);
    expect((await POST(request('x'.repeat(256*1024+1)))).status).toBe(413);
  });
});
