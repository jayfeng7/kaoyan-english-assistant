import 'server-only';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { essayParagraphs } from '@/lib/utils/essay-layout';
import type { EssayData } from '@/types';

export async function createEssayPdf(record: EssayData): Promise<Uint8Array> {
  if (!record.result) throw new Error('REPORT_RESULT_REQUIRED');
  const font = path.join(process.cwd(), 'assets/fonts/NotoSansSC-Regular.otf');
  const doc = new PDFDocument({ size: 'A4', margins: { top: 48, bottom: 56, left: 48, right: 48 }, font, bufferPages: true, info: { Title: '作文批改报告', Author: '考研英语助手', Subject: '作文练习批改' } });
  const chunks: Buffer[] = [];
  const output = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
  });
  const width = doc.page.width - 96;
  const ensure = (height: number) => { if (doc.y + height > doc.page.height - 56) doc.addPage(); };
  const heading = (title: string) => { ensure(48); doc.moveDown(.3).fontSize(12).fillColor('#20415e').text(title, 48, doc.y, { width, lineGap: 1 }).moveDown(.2); };
  const text = (value: string, size = 10) => { doc.fontSize(size).fillColor('#263744').text(value, 48, doc.y, { width, lineGap: 2, paragraphGap: 2 }); };
  const prose = (value: string) => { for (const paragraph of essayParagraphs(value)) { text(paragraph); doc.moveDown(.1); } };
  doc.fontSize(21).fillColor('#20415e').text('作文批改报告');
  doc.moveDown(.4); text(`${record.type === 'english1' ? '英语一' : '英语二'}  /  ${record.composition === 'small' ? '小作文' : '大作文'}  /  ${record.wordCount} 词`, 10);
  if (record.sourceLabel) text(record.sourceLabel, 10);
  doc.moveDown(.6);
  const result = record.result;
  if ('text' in result) { heading('已有反馈（尚未完成有效评分）'); prose(result.text); }
  else {
    const max = record.composition === 'small' ? 10 : record.type === 'english1' ? 20 : 15;
    ensure(82); const y = doc.y;
    doc.roundedRect(48, y, width, 64, 8).fill('#edf2f5');
    doc.fillColor('#20415e').fontSize(25).text(`${result.scoreCard.score} / ${max}`, 64, y + 8, { lineBreak: false });
    doc.fontSize(9).text(`${result.scoreCard.band.name}    内容 ${result.scoreCard.breakdown.content}  ·  语言 ${result.scoreCard.breakdown.language}  ·  结构 ${result.scoreCard.breakdown.structure}`, 64, y + 44, { width: width - 32, lineBreak: false });
    doc.y = y + 74;
    heading('总评'); text(result.overallComment);
    if (result.suggestions.length) { heading('修改建议'); result.suggestions.slice(0, 2).forEach((item, index) => text(`${index + 1}. ${item}`)); }
    heading('评分依据'); text(result.scoreCard.bandReason);
    if (result.sentenceAnnotations.length) {
      heading('逐句批注');
      for (const item of result.sentenceAnnotations) {
        ensure(65); text(`${item.index}. ${item.type === 'problem' ? '问题句' : item.type === 'highlight' ? '亮点句' : '原句'}  ${item.original}`);
        text(item.comment);
        if (item.correction) text(`建议改为：${item.correction}`);
        if (item.grammarPoint) text(`语法点：${item.grammarPoint}`, 9);
        doc.moveDown(.4);
      }
    }
  }
  heading('题目与要求'); prose(record.prompt);
  heading('作文原文'); prose(record.essay);
  if (!('text' in result)) {
    const reference = 'improvedEssay' in result ? result : result.reference;
    if (reference) {
      heading('改进版作文'); prose(reference.improvedEssay);
      heading('参考范文'); prose(reference.modelEssay);
      if (reference.expressions.length) { heading('表达积累'); reference.expressions.forEach(item => { text(`${item.expression}  ${item.meaning}`); text(item.example); }); }
    }
  }
  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i); doc.page.margins.bottom = 0;
    doc.fontSize(8).fillColor('#64707a').text(`分数供练习参考。`, 48, doc.page.height - 34, { lineBreak: false });
    doc.text(`${i + 1} / ${pages.count}`, doc.page.width - 96, doc.page.height - 34, { width: 48, align: 'right', lineBreak: false });
  }
  doc.end(); return output;
}
