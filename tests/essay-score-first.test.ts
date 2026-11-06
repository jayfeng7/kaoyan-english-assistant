import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EssayPreviewReader } from '@/lib/llm/essay-preview';
import { createEssayScoreCardSchema } from '@/lib/schemas/essay';
import { EssayStreamingReport } from '@/components/essay/EssayStreamingReport';
import { makeEssayResult, makeProviders } from './fixtures';
import { streamEssay } from '@/lib/llm/essay-stream';
import { ProviderFailure } from '@/lib/llm/client';
import { createEssayResultSchema } from '@/lib/schemas/essay';
import type { EssayStreamEvent, StructuredStreamCall } from '@/types';

describe('validated score before long analysis', () => {
  it('emits the complete score card before the first commentary character', () => {
    const result = makeEssayResult(); const reader = new EssayPreviewReader(createEssayScoreCardSchema('english1', 'big'));
    const events = [...JSON.stringify(result)].flatMap(char => reader.push(char));
    expect(events[0]).toEqual({ type: 'score', scoreCard: result.scoreCard });
    expect(events.filter(event => event.type === 'score')).toHaveLength(1);
  });
  it('never emits a partial, wrong-scale or mismatched sum as a score', () => {
    const result = makeEssayResult(); result.scoreCard.breakdown.content += 1;
    for (const schema of [createEssayScoreCardSchema('english1', 'big'), createEssayScoreCardSchema('english2', 'small')]) {
      expect(new EssayPreviewReader(schema).push(JSON.stringify(result)).some(event => event.type === 'score')).toBe(false);
    }
    expect(new EssayPreviewReader(createEssayScoreCardSchema('english1', 'big')).push('{"scoreCard":{"score":14}')).toEqual([]);
  });
  it('streams the overall comment under the provisional score while the rewrite stays hidden', () => {
    const preview = { ...makeEssayResult(), sentenceAnnotations: [], overallComment: 'ANALYSIS_STREAMED', improvedEssay: 'REWRITE_SHOULD_WAIT' };
    const html = renderToStaticMarkup(createElement(EssayStreamingReport, { preview, busy: true, stopped: false, startedAt: 0, max: 20, onStop: () => {} }));
    expect(html).toContain('暂评'); expect(html).toContain('/ 20'); expect(html).toContain('分数暂不保存');
    expect(html).toContain('ANALYSIS_STREAMED'); expect(html).not.toContain('REWRITE_SHOULD_WAIT');
  });
  it('removes a provisional score from an interrupted preview and preserves discussion material', () => {
    const preview = { ...makeEssayResult(), sentenceAnnotations: [], overallComment: 'Partial explanation.' };
    const html = renderToStaticMarkup(createElement(EssayStreamingReport, { preview, busy: false, stopped: true, startedAt: 0, onStop: () => {} }));
    expect(html).toContain('本次未保存分数'); expect(html).not.toContain('/ 20'); expect(html).toContain('Partial explanation.');
  });
  it('does not mix a backup report into an already visible score after an interruption', async () => {
    const result = makeEssayResult();
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { yield `{"scoreCard":${JSON.stringify(result.scoreCard)},`; throw new ProviderFailure('timeout'); });
    const events: EssayStreamEvent[] = [];
    await expect(async () => {
      for await (const event of streamEssay({ system: 'Test', user: 'Test' }, createEssayResultSchema('english1', 'big'), { id: 'test', startedAt: 0 }, { call, providers: makeProviders(), scoreSchema: createEssayScoreCardSchema('english1', 'big') })) events.push(event);
    }).rejects.toMatchObject({ code: 'ALL_PROVIDERS_FAILED' });
    expect(events.some(event => event.type === 'score')).toBe(true); expect(events.some(event => event.type === 'done')).toBe(false); expect(call).toHaveBeenCalledOnce();
  });
});
