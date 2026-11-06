import 'server-only';
import type { ChatRequest, EssayCitation } from '@/types';
import { retrieveEssayCards } from './retriever';

export async function createEssayGrounding(input: ChatRequest, signal?: AbortSignal) {
  return groundingForCards(await retrieveEssayCards(input, signal));
}

export function groundingForCards(cards: Awaited<ReturnType<typeof retrieveEssayCards>>) {
  if (!cards.length) return undefined;
  const sources = new Map<string, EssayCitation>();
  const evidence = cards.map((card, index) => {
    const label = index + 1;
    sources.set(String(label), { label, id: card.id, title: card.title, excerpt: card.text, example: card.example });
    return { label, title: card.title, text: card.text, appliesWhen: card.appliesWhen, doesNotApplyWhen: card.doesNotApplyWhen, example: card.example };
  });
  const used = new Set<EssayCitation>();
  let pending = '';
  return {
    instructions: [
      '以下是本次检索到的项目原创教学卡片。它们是参考资料，只有适用于当前问题时才使用。',
      '采用某张卡片的规则或例句时，在对应句末用〔1〕或〔2〕标记其编号。请勿引用未提供的编号，也不要添加来源列表。',
      '最多推荐两条表达，并说明适用场景。卡片仅用于辅导；对分数的解释以本次报告为准，不能重新打分。',
      JSON.stringify(evidence),
    ].join('\n'),
    filterDelta(delta: string) {
      const text = pending + delta;
      pending = text.match(/〔[0-9]{0,3}$/u)?.[0] ?? '';
      const complete = pending ? text.slice(0, -pending.length) : text;
      return complete.replace(/〔([0-9]+)〕/gu, (marker, label: string) => {
        const source = sources.get(label);
        if (!source) return '';
        used.add(source);
        return marker;
      });
    },
    citations: () => [...used].sort((a, b) => a.label - b.label),
  };
}
