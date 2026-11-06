import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/client/workspace', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
  const store = actual.useWorkspace as typeof useWorkspace;
  return { ...actual, useWorkspace: Object.assign((selector: (state: WorkspaceState) => unknown) => selector(store.getState()), store) };
});
import { checkEssaySubmission, essayBankPrompt, essaySubmissionInput, essayBankSelectionPatch } from '@/lib/client/essay-input';
import { essayDataSchema } from '@/lib/schemas/storage';
import { EssayResultView } from '@/components/essay/EssayResultView';
import { OcrReview } from '@/components/essay/OcrReview';
import { EssayForm } from '@/components/essay/EssayForm';
import { useWorkspace } from '@/lib/client/workspace';
import { ToastProvider } from '@/components/ui/Toast';
import { makeEssayBankItem, makeEssayData, makeEssayResult } from './fixtures';
import type { EssayDraft, WorkspaceState } from '@/types';

const ocr = { text: 'He go to school.', confidence: 0.5, lowConfidenceWords: [{ word: 'go', confidence: 0.4, start: 3, end: 5 }] };
const draft = (): EssayDraft => ({ type: 'english1', composition: 'big', source: 'custom', prompt: 'Write about school.', essay: 'Manual draft.', ocrText: '', ocrConfirmed: false });

describe('automatic essay input checks', () => {
  it('requires OCR review and full-page confirmation, while preserving student errors', () => {
    const value = { ...draft(), promptReview: { confirmed: false, pages: [{ number: 1, method: 'text' as const, text: 'Write about learning.' }] }, essayReview: { confirmed: false, pages: [{ number: 1, method: 'ocr' as const, text: ocr.text, ocr }] } };
    expect(checkEssaySubmission(value).success).toBe(false);
    value.essayReview.confirmed = true;
    Object.assign(value.essayReview, { pageCompleteness: 'full' });
    expect(checkEssaySubmission(value).success).toBe(true);
    expect(essaySubmissionInput(value)).toMatchObject({ prompt: 'Write about learning.', essay: 'He go to school.' });
    value.essayReview.pages[0]!.text = 'He go to school everyday.';
    expect(checkEssaySubmission(value).success).toBe(true);
    expect(essaySubmissionInput(value).essay).toBe('He go to school everyday.');
  });
  it('supports legacy OCR and restored historical records', () => {
    const record = essayDataSchema.parse(makeEssayData());
    expect(checkEssaySubmission({ ...draft(), ocrResult: ocr, ocrText: ocr.text, ocrConfirmed: false }).success).toBe(false);
    expect(essaySubmissionInput({ ...draft(), prompt: record.prompt, essay: record.essay }).essay).toBe(record.essay);
  });
  it.each([{ prompt: '' }, { prompt: 'x'.repeat(501) }, { essay: ' ' }, { essay: 'x'.repeat(8001) }, { essayReview: { confirmed: true, pages: [{ number: 1, method: 'text' as const, text: '' }] } }])('rejects empty or oversized actual text %#', patch => {
    expect(checkEssaySubmission({ ...draft(), ...patch }).success).toBe(false);
  });
  it('rejects a missing, mismatched or differently typed bank item', () => {
    const item = makeEssayBankItem();
    const value = { ...draft(), source: 'bank' as const, bankId: item.id, bankItem: item, prompt: essayBankPrompt(item) };
    expect(checkEssaySubmission(value).success).toBe(true);
    for (const patch of [{ bankId: 'english1-2020-big' }, { bankItem: undefined }, { type: 'english2' as const }, { composition: 'small' as const }]) expect(checkEssaySubmission({ ...value, ...patch }).success).toBe(false);
  });
});

describe('explicit task adoption', () => {
  it('updates paper, composition and question together without replacing student text', () => {
    const current = { ...draft(), composition: 'small' as const };
    const item = { ...makeEssayBankItem(), id: 'english2-2019-big', type: 'english2' as const };
    const patch = essayBankSelectionPatch(current, item);
    expect(patch).toMatchObject({ type: 'english2', composition: 'big', bankId: item.id, year: item.year, source: 'bank', customPrompt: current.prompt });
    expect(patch.essay).toBeUndefined(); expect(patch.essayReview).toBeUndefined();
    expect(essaySubmissionInput({ ...current, ...patch })).toMatchObject({ type: 'english2', composition: 'big', essay: current.essay });
  });
});

describe('report first presentation', () => {
  it('puts scores and existing priority suggestions ahead of expandable original and details', () => {
    const result = { ...makeEssayResult(), suggestions: ['FIRST_PRIORITY', 'SECOND_PRIORITY', 'THIRD_PRIORITY', 'FOURTH_DETAIL'] };
    const html = renderToStaticMarkup(createElement(EssayResultView, { record: { ...makeEssayData(), result } }));
    expect(html.indexOf('>评分<')).toBeLessThan(html.indexOf('总评'));
    expect(html.indexOf('总评')).toBeLessThan(html.indexOf('FIRST_PRIORITY'));
    expect(html.indexOf('FIRST_PRIORITY')).toBeLessThan(html.indexOf('逐句批注'));
    expect(html.indexOf('逐句批注')).toBeLessThan(html.indexOf('题目与作文原文'));
    expect(html).toContain('其他建议'); expect(html).toContain('FOURTH_DETAIL');
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain('Learning takes practice.');
  });
  it('shows confidence and editable safe original text without an extra confirmation button', () => {
    const html = renderToStaticMarkup(createElement(OcrReview, { result: ocr, text: '<script>He go</script>', onChange: () => {}, onConfirm: () => {}, valid: true, confirmed: false, busy: false, automatic: true }));
    expect(html).toContain('<mark'); expect(html).toContain('请核对'); expect(html).not.toContain('置信度'); expect(html).toContain('<textarea');
    expect(html).not.toContain('<button'); expect(html).not.toContain('<script>');
  });
  it('blocks scoring unconfirmed OCR text and explains the next step without showing an empty report', () => {
    const previous = useWorkspace.getState();
    useWorkspace.setState({ ready: true, essay: { ...draft(), essayReview: { confirmed: false, pages: [{ number: 1, method: 'ocr', text: ocr.text, ocr }] } } });
    try {
      const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement(EssayForm, {})));
      const submit = html.match(/<button[^>]*type="submit"[^>]*>批改/);
      expect(submit).not.toBeNull(); expect(submit?.[0]).toContain(' disabled=""');
      expect(html).toContain('当前正文 4 词');
      expect(html).not.toContain('请先确认'); expect(html).not.toContain('让每一分都有依据'); expect(html).not.toContain('替换当前作文题目');
    } finally { useWorkspace.setState(previous); }
  });
  it('opens restored reports directly with editing and direct PDF export', () => {
    const previous = useWorkspace.getState(); useWorkspace.setState({ ready: true, essay: { ...draft(), record: makeEssayData() } });
    try {
      const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement(EssayForm, {})));
      expect(html).toContain('>评分<'); expect(html).toContain('编辑作文'); expect(html).toContain('导出批改报告 PDF'); expect(html).not.toContain('打印 / 另存 PDF'); expect(html).not.toContain('开始批改');
      expect(html).not.toContain('aria-label="继续对话"'); expect(html).toContain('继续提问'); expect(html).toContain('关于这篇作文的问题');
      const screen = html.split('<section data-essay-report')[0]!;
      expect(screen.match(/<h1\b/g)).toHaveLength(1);
      expect(screen).toMatch(/<h1[^>]*>批改结果<\/h1>/);
      expect(screen.indexOf('继续提问')).toBeLessThan(screen.indexOf('改进版与参考'));
      expect(screen).not.toContain('选择题目，输入或上传作文');
    } finally { useWorkspace.setState(previous); }
  });
  it('keeps follow-up available on a saved incomplete text result without presenting a score', () => {
    const previous = useWorkspace.getState();
    useWorkspace.setState({ ready: true, essay: { ...draft(), record: { ...makeEssayData(), result: { text: '未完成有效评分。已有文字反馈。' } } } });
    try {
      const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement(EssayForm, {})));
      expect(html).toContain('本次未能给分'); expect(html).toContain('继续提问');
      expect(html).toContain('重新批改'); expect(html).not.toContain('>评分<');
      const composer = html.match(/<textarea\b[^>]*>/)?.[0];
      expect(composer).toBeDefined(); expect(composer).not.toContain('disabled');
    } finally { useWorkspace.setState(previous); }
  });
  it.each([
    [{ prompt: '' }, '请填写题目。'],
    [{ essay: '' }, '请填写正文。'],
    [{ source: 'bank' as const }, '请选择年份。'],
  ] as const)('explains incomplete input instead of leaving a disabled action unexplained %#', (patch, hint) => {
    const previous = useWorkspace.getState(); useWorkspace.setState({ ready: true, essay: { ...draft(), ...patch } });
    try {
      const html = renderToStaticMarkup(createElement(ToastProvider, null, createElement(EssayForm, {})));
      expect(html).toContain(hint);
      expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-describedby="[^"]+"/);
    } finally { useWorkspace.setState(previous); }
  });
});
