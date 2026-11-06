import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { buildIndex, retrievalMetrics } from './bm25.mjs';

const base = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2); const options = {filter:true};
for (let i=0;i<args.length;i++) {
  const arg=args[i];
  if(arg==='--no-filter') options.filter=false;
  else if(['--query','--genre','--composition','--explain','--k1','--b'].includes(arg) && args[i+1] && !args[i+1].startsWith('--')) options[arg.slice(2)]=args[++i];
  else throw new Error('Options: --no-filter, --query TEXT, --genre GENRE, --composition small|big, --explain Q09, --k1 1.2, --b 0.75');
}
const corpusBytes=await fs.readFile(path.join(base,'data/lesson02-corpus.json'));
const queryBytes=await fs.readFile(path.join(base,'data/lesson02-queries.json'));
const corpus=JSON.parse(corpusBytes.toString('utf8')); const cases=JSON.parse(queryBytes.toString('utf8'));
assert.equal(corpus.source.type,'original_demo');
const ids=new Set();
for(const card of corpus.cards) {
  for(const field of ['id','documentId','title','text','appliesWhen','doesNotApplyWhen','example']) assert.ok(typeof card[field]==='string'&&card[field].trim(),field);
  assert.ok(!ids.has(card.id)); ids.add(card.id);
  assert.ok(['small','big','any'].includes(card.composition)); assert.ok(Array.isArray(card.genres)&&card.genres.length>0);
}
const caseIds=new Set();
for(const q of cases.queries) {
  assert.ok(!caseIds.has(q.id));caseIds.add(q.id);
  assert.ok(typeof q.query==='string'&&q.query.trim());
  for(const [id,grade] of Object.entries(q.relevance)) {assert.ok(ids.has(id),'Unknown relevance chunk');assert.ok([1,2].includes(grade));}
}
if(options.composition && !['small','big'].includes(options.composition)) throw new Error('Unknown composition');
if(options.genre && !corpus.cards.some(card=>card.genres.includes(options.genre))) throw new Error('Unknown genre');
if(!options.query && (options.genre || options.composition)) throw new Error('Use --query with explicit metadata; evaluation uses each case metadata.');
const index=buildIndex(corpus.cards,{k1:options.k1===undefined?1.2:Number(options.k1),b:options.b===undefined?.75:Number(options.b)});
console.log('真实词项统计的BM25教学基线；10张原创演示卡，标签未经独立复核，不是生产质量验收。');
console.log(JSON.stringify({corpusVersion:corpus.version,tokenizer:'Intl.Segmenter(zh,word)+NFKC+lowercase+lesson_stopwords_v1',node:process.version,icu:process.versions.icu,stats:index.stats,filter:options.filter}));
if(options.query) {
  const result=index.search(options.query,{...options,k:5});console.log('query terms:',result.terms.join(' | '));
  console.table(result.hits.map(h=>({id:h.id,score:h.score.toFixed(4),title:h.title,matched:h.contributions.map(c=>c.term).join(', ')})));
  process.exit(0);
}
const rows=cases.queries.map(q=>{
  const result=index.search(q.query,{genre:q.genre,composition:q.composition,filter:options.filter,k:5});
  return {id:q.id,group:q.group,query:q.query,relevance:q.relevance,...result,at3:retrievalMetrics(result.hits,q.relevance,3),at5:retrievalMetrics(result.hits,q.relevance,5)};
});
const answerable=rows.filter(r=>r.at3.answerable); const emptyCases=rows.filter(r=>!r.at3.answerable);
const mean=(a)=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const summary={queries:rows.length,answerable:answerable.length,noAnswer:emptyCases.length,top1Hits:answerable.filter(r=>(r.relevance[r.hits[0]?.id]??0)>0).length,recallAt3:mean(answerable.map(r=>r.at3.recall)),recallAt5:mean(answerable.map(r=>r.at5.recall)),mrrAt5:mean(answerable.map(r=>r.at5.reciprocalRank)),ndcgAt3:mean(answerable.map(r=>r.at3.ndcg)),correctEmpty:emptyCases.filter(r=>r.at3.correctEmpty).length};
console.table(rows.map(r=>({id:r.id,top1:r.hits[0]?.id??'(empty)',relevantTop1:(r.relevance[r.hits[0]?.id]??0)>0,recallAt3:r.at3.recall,emptyCorrect:r.at3.correctEmpty})));
console.log(JSON.stringify(summary,null,2));
if(options.explain) {
  const row=rows.find(r=>r.id===options.explain.toUpperCase());if(!row)throw new Error('Unknown query ID');
  console.log(row.query,'\nquery terms:',row.terms.join(' | '));
  for(const hit of row.hits.slice(0,3)){console.log(hit.id,'score=',hit.score,'documentLength=',hit.documentLength);console.table(hit.contributions);}
}
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={at:new Date().toISOString(),scope:'development_demo_only',qualityAccepted:false,corpusHash:hash(corpusBytes),queriesHash:hash(queryBytes),corpusVersion:corpus.version,queryVersion:cases.version,node:process.version,icu:process.versions.icu,filter:options.filter,stats:index.stats,summary,rows};
const output=path.resolve(base,'../../artifacts/rag-lesson02',`bm25-${Date.now()}-${options.filter?'filtered':'unfiltered'}.json`);
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
console.log('Report:',output);
