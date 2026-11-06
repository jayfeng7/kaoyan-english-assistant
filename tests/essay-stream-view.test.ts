import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EssayStreamingReport } from '@/components/essay/EssayStreamingReport';
import { EssayResultView } from '@/components/essay/EssayResultView';
import { makeEssayData } from './fixtures';
describe('essay stream preview and final scale', () => {
  it('shows readable text and cancellation without raw JSON, a score or active markup', () => {
    const html = renderToStaticMarkup(createElement(EssayStreamingReport, { preview: { overallComment: '<script>unsafe</script>评语', improvedEssay: 'Draft rewrite', modelEssay: '', sentenceAnnotations: [] }, busy: true, stopped: false, startedAt: 0, onStop: () => {} }));
    expect(html).toContain('停止'); expect(html).toContain('正在评分'); expect(html).not.toContain('Draft rewrite'); expect(html).not.toMatch(/<script>|scoreCard|评分卡/);
  });
  it('marks stopped previews as incomplete and never presents a saved score', () => {
    const html = renderToStaticMarkup(createElement(EssayStreamingReport, { preview: { overallComment: 'Partial comment', improvedEssay: '', modelEssay: '', sentenceAnnotations: [] }, busy: false, stopped: true, startedAt: 0, onStop: () => {} })); expect(html).toContain('批改已停止'); expect(html).toContain('本次未保存分数'); expect(html).not.toContain('<button');
  });
  it.each([['english1', 'big', 20], ['english2', 'big', 15], ['english1', 'small', 10], ['english2', 'small', 10]] as const)('uses %s/%s maximum %d in the report', (type, composition, max) => {
    const record = { ...makeEssayData(), type, composition };
    const html = renderToStaticMarkup(createElement(EssayResultView, { record })); expect(html).toContain(`/ ${max}`);
  });
});
