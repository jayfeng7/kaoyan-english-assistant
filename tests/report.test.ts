import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EssayPrintReport } from '@/components/essay/EssayPrintReport';
import { Textarea } from '@/components/ui/Textarea';
import { TaskFeedback } from '@/components/ui/TaskFeedback';
import { makeEssayData } from './fixtures';

describe('printable essay snapshot', () => {
  it('contains the original and complete result, excludes proofreading and follow-ups', () => {
    const record = makeEssayData();
    record.followUps = [{ id: record.id, role: 'user', content: 'PRIVATE_FOLLOW_UP_NOT_PRINTED', createdAt: 200, status: 'done' }];
    record.ocrResult = { text: 'RAW_OCR_NOT_PRINTED', confidence: 0.5, lowConfidenceWords: [] };
    const html = renderToStaticMarkup(createElement(EssayPrintReport, { record }));
    for (const expected of [record.prompt, record.essay, '评分', '总评', '逐句批注', '改进版作文', '参考范文', '可积累表达', '下一步建议']) expect(html).toContain(expected);
    for (const excluded of ['PRIVATE_FOLLOW_UP_NOT_PRINTED', 'RAW_OCR_NOT_PRINTED', '<textarea', '<button', '手写识别校对']) expect(html).not.toContain(excluded);
    expect(html).toContain('data-essay-report');
    expect(html).not.toContain('<details');
  });
  it('prints safe text fallback and omits the report without a result', () => {
    const record = makeEssayData(); record.result = { text: 'Readable fallback <script>unsafe()</script>' };
    const html = renderToStaticMarkup(createElement(EssayPrintReport, { record }));
    expect(html).toContain('Readable fallback'); expect(html).not.toContain('<script>');
    record.result = undefined;
    expect(renderToStaticMarkup(createElement(EssayPrintReport, { record }))).toBe('');
  });
});
describe('recoverable input and error views', () => {
  it('retains all over-limit input, announces the limit and links its explanation', () => {
    const html = renderToStaticMarkup(createElement(Textarea, { label: 'Essay', characterLimit: 8000, value: 'x'.repeat(8001), readOnly: true }));
    expect(html).toContain('x'.repeat(8001)); expect(html).toContain('超过 8000 字上限');
    expect(html).toContain('aria-invalid="true"'); expect(html).toMatch(/aria-describedby="[^"]*-description [^"]*-count"/);
  });
  it('shows a retry action only for a failed request', () => {
    expect(renderToStaticMarkup(createElement(TaskFeedback, {}))).toBe('');
    const html = renderToStaticMarkup(createElement(TaskFeedback, { error: '网络连接失败', onRetry: () => undefined, disabled: true }));
    expect(html).toContain('输入内容已保留'); expect(html).toContain('重试'); expect(html).toMatch(/<button[^>]*disabled=""/);
  });
});
