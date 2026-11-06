interface SearchCard {
  id: string;
  title: string;
  text: string;
  appliesWhen: string;
  example: string;
  composition: string;
  genres: string[];
  keywords?: string[];
}

export function buildIndex<T extends SearchCard>(cards: T[]): {
  search(query: string, options?: {
    composition?: string;
    genre?: string;
    accept?: (card: T) => boolean;
    k?: number;
  }): { hits: { id: string; score: number }[] };
};

export function retrievalMetrics(hits: { id: string }[], relevance: Record<string, number>, k?: number): {
  answerable: boolean;
  correctEmpty: boolean | null;
  recall: number | null;
  reciprocalRank: number | null;
  ndcg: number | null;
};
