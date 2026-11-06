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
