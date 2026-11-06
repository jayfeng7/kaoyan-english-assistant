import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createEssayCoreResultSchema, createEssayReportSchema, createEssayResultSchema, createEssayScoreCardSchema, essayReferenceSchema } from '@/lib/schemas/essay';
import { essayDataSchema } from '@/lib/schemas/storage';
import { buildEssayPrompt } from '@/lib/prompts/essay';
import { streamEssay } from '@/lib/llm/essay-stream';
import { EssayPrintReport } from '@/components/essay/EssayPrintReport';
import { EssayResultView } from '@/components/essay/EssayResultView';
import { followUpContext } from '@/lib/client/follow-up';
import { makeEssayData, makeEssayResult, makeProviders } from './fixtures';
import type { EssayCoreResult, EssayStreamEvent, StructuredStreamCall } from '@/types';

const full = makeEssayResult();
const core: EssayCoreResult = { kind: 'core', scoreCard: full.scoreCard, overallComment: full.overallComment, sentenceAnnotations: full.sentenceAnnotations, suggestions: full.suggestions };
const input = { type: 'english1' as const, composition: 'big' as const, prompt: 'Write about practice.', essay: 'Learning takes practice.' };
describe('short validated correction with optional reference', () => {
  it('requires an explicit complete core result; legacy full reports still require reference fields', () => {
    expect(createEssayCoreResultSchema('english1', 'big').safeParse(core).success).toBe(true);
    expect(createEssayResultSchema('english1', 'big').safeParse(core).success).toBe(false);
    const { kind, ...missingMarker } = core; expect(kind).toBe('core');
    expect(createEssayReportSchema('english1', 'big').safeParse(missingMarker).success).toBe(false);
    expect(createEssayReportSchema('english1', 'big').safeParse(full).success).toBe(true);
    expect(createEssayReportSchema('english2', 'small').safeParse(core).success).toBe(false);
    expect(createEssayReportSchema('english1', 'big').safeParse({ ...core, scoreCard: { ...core.scoreCard, breakdown: { content: 0, language: 0, structure: 0 } } }).success).toBe(false);
  });
  it('rejects an unfinished core or unrequested model reference', () => {
    expect(createEssayCoreResultSchema('english1', 'big').safeParse({ ...core, suggestions: [] }).success).toBe(false);
    expect(createEssayCoreResultSchema('english1', 'big').safeParse({ ...core, improvedEssay: 'Extra output' }).success).toBe(false);
    expect(createEssayReportSchema('english1', 'big').safeParse({ ...core, reference: { improvedEssay: '' } }).success).toBe(false);
  });
  it('finishes and saves core output without waiting for a rewrite, preserving original and follow-ups through history', async () => {
    const call = vi.fn<StructuredStreamCall>().mockImplementation(async function* () { for (const part of JSON.stringify(core)) yield part; });
    const events: EssayStreamEvent[] = [];
    for await (const event of streamEssay(buildEssayPrompt({ ...input, report: 'core' }), createEssayCoreResultSchema('english1', 'big'), { id: 'test', startedAt: 0 }, { call, providers: makeProviders(), scoreSchema: createEssayScoreCardSchema('english1', 'big') })) events.push(event);
    expect(events.at(-1)).toMatchObject({ type: 'done', data: core });
    expect(events.findIndex(event => event.type === 'score')).toBeLessThan(events.findIndex(event => event.type === 'preview'));
    const saved = essayDataSchema.parse(JSON.parse(JSON.stringify({ ...makeEssayData(), result: core, essay: 'He go to school.' })));
    expect(saved.result).toEqual(core); expect(saved.essay).toBe('He go to school.'); expect(saved.followUps).toHaveLength(1);
    const context = JSON.parse(followUpContext(saved).summary);
    expect(context.essay).toBe('He go to school.'); expect(context.result.scoreCard.score).toBe(14); expect(context.assessmentStatus).toBeUndefined();
  });
  it('core example is valid and does not generate hidden long references', () => {
    const prompt = buildEssayPrompt({ ...input, report: 'core' });
    const example = prompt.system.split('\n').find(line => line.startsWith('{"scoreCard"'));
    expect(createEssayCoreResultSchema('english1', 'big').safeParse(JSON.parse(example!)).success).toBe(true);
    expect(example).not.toMatch(/improvedEssay|modelEssay|expressions/);
  });
  it('prints core grading honestly and preserves the same score when reference is added', () => {
    const record = { ...makeEssayData(), result: core };
    expect(renderToStaticMarkup(createElement(EssayPrintReport, { record }))).toContain('尚未生成');
    const reference = essayReferenceSchema.parse({ improvedEssay: full.improvedEssay, modelEssay: full.modelEssay, expressions: full.expressions });
    const enriched = essayDataSchema.parse({ ...record, result: { ...core, reference } });
    const html = renderToStaticMarkup(createElement(EssayResultView, { record: enriched, expanded: true }));
    expect(html).toContain(full.improvedEssay); expect(html).toContain(full.modelEssay); expect(html).not.toContain('尚未生成');
    expect(enriched.result).toMatchObject({ scoreCard: core.scoreCard });
  });
});
