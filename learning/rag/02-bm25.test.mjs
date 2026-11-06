import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, tokenize, retrievalMetrics } from './bm25.mjs';
const card=(id,title,genre='invitation')=>({id,title,composition:'small',genres:[genre]});

test('mixed Chinese/English tokenization preserves negation and English case equivalence',()=>{
  const terms=tokenize('邀请信 He go 不正确。');assert.ok(terms.includes('邀请'));assert.ok(terms.includes('he'));assert.ok(terms.includes('不'));assert.deepEqual(tokenize('He GO'),tokenize('he go'));
});
test('BM25 matches a hand-computed equal-length example',()=>{
  const index=buildIndex([card('a','apple apple'),card('b','apple banana'),card('c','banana banana')]);
  const hits=index.search('apple').hits;
  assert.equal(hits[0].id,'a');assert.ok(Math.abs(hits[0].score-0.6462549902128865)<1e-12);assert.ok(Math.abs(hits[1].score-0.47000362924573563)<1e-12);
});
test('length normalization affects equal-frequency documents and b=0 disables it',()=>{
  const cards=[card('short','apple'),card('long','apple '+'banana '.repeat(20))];
  const hits=buildIndex(cards).search('apple').hits;assert.equal(hits[0].id,'short');assert.ok(hits[0].score>hits[1].score);
  const flat=buildIndex(cards,{b:0}).search('apple').hits;assert.equal(flat[0].score,flat[1].score);
});
test('repeated term counts have diminishing returns when length normalization is disabled',()=>{
  const index=buildIndex([card('a','apple'),card('b','apple apple'),card('c','apple apple apple')],{b:0});
  const byId=Object.fromEntries(index.search('apple').hits.map(h=>[h.id,h.score]));assert.ok(byId.c-byId.b<byId.b-byId.a);
});
test('k1=0 makes a matching term binary rather than counting repeated occurrences',()=>{
  const hits=buildIndex([card('a','apple'),card('b','apple apple apple')],{k1:0}).search('apple').hits;
  assert.equal(hits[0].score,hits[1].score);
});
test('metadata filtering excludes other genres while allowing general rules without rebuilding global statistics',()=>{
  const index=buildIndex([card('a','apple','invitation'),card('b','apple','notice'),card('c','apple','any')]);
  assert.deepEqual(index.search('apple',{genre:'invitation'}).hits.map(h=>h.id),['a','c']);assert.equal(index.stats.N,3);assert.equal(index.search('apple',{filter:false}).hits.length,3);
});
test('no lexical match returns empty rather than an arbitrary top document',()=>{
  assert.deepEqual(buildIndex([card('a','apple')]).search('quantum').hits,[]);
});
test('invalid index parameters, duplicate IDs and invalid top-K fail clearly',()=>{
  assert.throws(()=>buildIndex([],{b:2}));assert.throws(()=>buildIndex([],{k1:NaN}));assert.throws(()=>buildIndex([card('a','apple'),card('a','banana')]));assert.throws(()=>buildIndex([]).search('apple',{k:0}));
});
test('metrics distinguish ranking misses and no-answer cases',()=>{
  const metrics=retrievalMetrics([{id:'wrong'},{id:'good'}],{good:2},3);assert.equal(metrics.recall,1);assert.equal(metrics.reciprocalRank,.5);assert.ok(Math.abs(metrics.ndcg-1/Math.log2(3))<1e-12);
  assert.equal(retrievalMetrics([],{good:2}).recall,0);assert.equal(retrievalMetrics([],{}).correctEmpty,true);assert.equal(retrievalMetrics([{id:'wrong'}],{}).correctEmpty,false);
});
