import 'server-only';
import type { ChatRequest } from '@/types';
import { buildIndex } from './bm25.mjs';
import cards from './cards.json';

const byId = new Map(cards.map((card) => [card.id, card]));
const index = buildIndex(cards);
const genres = {
  invitation: /邀请|\binvit(?:e|es|ing|ation|ations)\b/iu,
  notice: /通知|公告|\b(?:notice|announcement)\b/iu,
  request: /请求信|求助信|\b(?:letter|email) (?:of|to) request\b|\brequest(?:ing)? (?:help|assistance)\b/iu,
  apology: /道歉|致歉|\bapolog(?:y|ize|ise|izing|ising)\b/iu,
  advice: /建议信|提建议|\b(?:offer|give|giving) (?:some )?(?:advice|suggestions)\b/iu,
  chart: /图表|柱状图|折线图|饼图|\b(?:chart|graph)\b/iu,
  picture: /图画|漫画|\b(?:picture|cartoon|drawing)\b/iu,
};

function genreOf(text: string): string | undefined {
  const matches = Object.entries(genres).filter(([, pattern]) => pattern.test(text));
  return matches.length === 1 ? matches[0]?.[0] : undefined;
}

function matchesKeyword(query: string, keyword: string): boolean {
  if (/[^\x00-\x7F]/u.test(keyword)) return query.includes(keyword);
  // A word boundary keeps short English signals out of unrelated words.
  return (' ' + query.replace(/[^a-z0-9]+/gu, ' ') + ' ').includes(' ' + keyword.replaceAll('-', ' ') + ' ');
}

export function retrieveEssayCards(input: ChatRequest) {
  const last = input.messages.at(-1);
  if (process.env.ESSAY_RAG_ENABLED === '0' || input.followUp?.kind !== 'essay' || last?.role !== 'user') return [];
  if (input.followUp.summary.length > 50_000) return [];

  let snapshot: unknown;
  try { snapshot = JSON.parse(input.followUp.summary); } catch { return []; }
  if (!snapshot || typeof snapshot !== 'object' || !('composition' in snapshot)) return [];
  const { composition } = snapshot;
  if (composition !== 'small' && composition !== 'big') return [];

  const question = last.content.slice(0, 2000);
  const prompt = 'prompt' in snapshot && typeof snapshot.prompt === 'string' ? snapshot.prompt.slice(0, 6000) : '';
  const genre = genreOf(prompt) ?? genreOf(question);
  const rank = (text: string) => {
    const query = text.normalize('NFKC').toLowerCase();
    return index.search(query, {
      composition, genre, k: 2,
      accept: (card) => (genre !== undefined || card.genres.includes('any')) &&
        card.keywords.some((keyword) => matchesKeyword(query, keyword)),
    }).hits;
  };

  let hits = rank(question);
  // Short references inherit only the previous user question, never model output.
  if (!hits.length && question.length <= 80 && /(?:再举|再给|换个|换一|另一|这条|那条|第[一二三12]条|another example|that rule)/iu.test(question)) {
    const previous = input.messages.slice(-8, -1).reverse().find((message) => message.role === 'user');
    if (previous) hits = rank(previous.content.slice(0, 2000));
  }
  return hits.flatMap(({ id }) => {
    const card = byId.get(id);
    return card ? [card] : [];
  });
}
