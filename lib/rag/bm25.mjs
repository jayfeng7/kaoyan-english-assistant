// Shared lexical index for the essay coach and the offline retrieval lab.
const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
const stopwords = new Set(['的','了','吗','呢','请','如何','怎么','怎样','什么','这个','这','那','我','你','一个','是','在','与','和','可以','应该']);

export function tokenize(text) {
  return [...segmenter.segment(text.normalize('NFKC').toLowerCase())]
    .filter(part => part.isWordLike && !stopwords.has(part.segment)).map(part => part.segment);
}

export function searchText(card) { return [card.title, card.text, card.appliesWhen, card.example, card.keywords?.join(" ")].filter(Boolean).join('\n'); }

export function buildIndex(cards, { k1 = 1.2, b = .75 } = {}) {
  if (!Number.isFinite(k1) || k1 < 0 || !Number.isFinite(b) || b < 0 || b > 1) throw new Error('Invalid BM25 parameters');
  const ids = new Set(); const df = new Map();
  const documents = cards.map(card => {
    if (!card.id || ids.has(card.id)) throw new Error('Missing or duplicate chunk ID');
    ids.add(card.id); const tokens = tokenize(searchText(card)); const tf = new Map();
    for (const term of tokens) tf.set(term, (tf.get(term) ?? 0) + 1);
    for (const term of tf.keys()) df.set(term, (df.get(term) ?? 0) + 1);
    return { card, length:tokens.length, tf };
  });
  const N = documents.length;
  const avgLength = N ? documents.reduce((sum, d) => sum + d.length, 0) / N : 0;
  function search(query, { composition, genre, filter = true, accept = () => true, k = 5 } = {}) {
    if (!Number.isInteger(k) || k < 1 || k > 100) throw new Error('Invalid top-K');
    const terms = [...new Set(tokenize(query))];
    const candidates = documents.filter(({card}) => accept(card) && (!filter ||
      ((!composition || card.composition === 'any' || card.composition === composition) &&
       (!genre || card.genres.includes('any') || card.genres.includes(genre)))));
    const hits = candidates.map(doc => {
      const contributions = terms.flatMap(term => {
        const tf = doc.tf.get(term) ?? 0;
        if (!tf || !avgLength) return [];
        const documentFrequency = df.get(term);
        const idf = Math.log(1 + (N - documentFrequency + .5) / (documentFrequency + .5));
        const lengthNorm = 1 - b + b * doc.length / avgLength;
        const value = idf * tf * (k1 + 1) / (tf + k1 * lengthNorm);
        return [{term,tf,df:documentFrequency,idf,lengthNorm,value}];
      });
      return {id:doc.card.id,title:doc.card.title,genre:doc.card.genres,documentLength:doc.length,score:contributions.reduce((sum,c)=>sum+c.value,0),contributions};
    }).filter(hit => hit.score > 0).sort((a,b)=>b.score-a.score || a.id.localeCompare(b.id)).slice(0,k);
    return {terms,candidateCount:candidates.length,hits};
  }
  return {search, stats:{N,avgLength,vocabulary:df.size,k1,b}};
}

export function retrievalMetrics(hits, relevance, k = 3) {
  const relevant = Object.entries(relevance).filter(([,grade])=>grade>0);
  const top = hits.slice(0,k);
  if (!relevant.length) return {answerable:false,correctEmpty:hits.length===0,recall:null,reciprocalRank:null,ndcg:null};
  const found = top.filter(hit=>(relevance[hit.id]??0)>0).length;
  const rank = top.findIndex(hit=>(relevance[hit.id]??0)>0);
  const dcg = top.reduce((sum,hit,i)=>sum+(2**(relevance[hit.id]??0)-1)/Math.log2(i+2),0);
  const ideal = relevant.map(([,grade])=>grade).sort((a,b)=>b-a).slice(0,k).reduce((sum,grade,i)=>sum+(2**grade-1)/Math.log2(i+2),0);
  return {answerable:true,correctEmpty:null,recall:found/relevant.length,reciprocalRank:rank<0?0:1/(rank+1),ndcg:dcg/ideal};
}
