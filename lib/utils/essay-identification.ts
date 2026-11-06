import type { EssayIdentifyRequest, EssayIdentification } from '@/lib/schemas/essay-identification';
import { essayMatchOutputSchema } from '@/lib/schemas/essay-identification';
import type { EssayBankItem } from '@/types';

const normalize = (text: string) => text.normalize('NFC').replace(/\s+/gu, ' ').trim();
export function unknownEssayIdentification(reason: string): EssayIdentification {
  return { status: 'unknown', needsConfirmation: true, confidence: 0, candidates: [], limitations: [reason, '题目归属需要对照原题核实；此结果不能证明图片完整或直接作为评分结论。'] };
}

// Only the server-owned catalog supplies years/types. The model can rank IDs, never invent tasks.
export function validateEssayIdentification(input: EssayIdentifyRequest, raw: unknown, catalog: EssayBankItem[]): EssayIdentification {
  const parsed = essayMatchOutputSchema.safeParse(raw);
  if (!parsed.success) return unknownEssayIdentification('未得到可验证的题库匹配，请手动选择题目。');
  const sources = [input.essay, input.prompt].map(normalize);
  const hasTopicContent = (quote: string) => normalize(quote).length >= 8 && normalize(quote).replace(/\b(?:from|to|in|and|the|of|year|years|was|is|at|by|on)\b/giu, '').replace(/[\d\s.,%/:'’\-年月日]/gu, '').length >= 3;
  const known = new Map(catalog.filter(item => item.reviewed).map(item => [item.id, item]));
  const seen = new Set<string>();
  const ranked = [...parsed.data.candidates].sort((a,b) => b.confidence-a.confidence).flatMap(candidate => {
    const item = known.get(candidate.id);
    const evidence = candidate.evidence.filter(quote => quote.length <= 180 && hasTopicContent(quote) && sources.some(text => text.includes(normalize(quote)))).slice(0,3);
    if (!item || seen.has(item.id) || !evidence.length || candidate.confidence < .35) return [];
    seen.add(item.id);
    return [{ id: item.id, type: item.type, composition: item.composition, year: item.year, title: item.title, confidence: candidate.confidence, evidence, reason: candidate.reason }];
  });
  if (!ranked.length) return unknownEssayIdentification('正文信息不足、引文无法核实或题库中没有可靠匹配，请补充题面。');
  const unclear = /\[\?\]|☰/u.test(input.essay) || Boolean(input.inputEvidence && (!input.inputEvidence.reviewed || input.inputEvidence.pageCompleteness !== 'full' || input.inputEvidence.bodyStatus !== 'ready'));
  const top = ranked[0]!; const gap = top.confidence - (ranked[1]?.confidence ?? 0);
  return {
    status: !unclear && top.confidence >= .75 && gap >= .15 ? 'suggested' : 'ambiguous', needsConfirmation: true,
    confidence: Math.min(top.confidence, unclear ? .5 : 1),
    candidates: ranked.map(candidate => ({ ...candidate, confidence: Math.min(candidate.confidence, unclear ? .5 : 1) })),
    limitations: [...(unclear ? ['识别文字或页面完整性尚未核实，候选题目可能受误识影响，请先对照原图检查。'] : []), ...parsed.data.limitations, '归属来自题库语义匹配，置信度为未校准的模型估计；必须核对原题后确认。', '图表数据年份、正文叙述年份和落款日期不等于考试年份；不能据此认定整篇结构或分数。'],
  };
}
