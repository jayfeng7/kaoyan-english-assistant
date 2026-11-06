// Teaching only: manually assigned two-dimensional vectors, not real embeddings.
// No network, models, credentials, product imports or persistent writes.
import assert from 'node:assert/strict';

export function cosine(a, b) {
  if (!a.length || a.length !== b.length || [...a, ...b].some(x => !Number.isFinite(x))) throw new Error('Vectors must have equal non-zero dimensions and finite numbers.');
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0);
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (!normA || !normB) throw new Error('Cosine is undefined for a zero vector.');
  return dot / (normA * normB);
}

const cards = [
  { id:'notice-001', genre:'notice', title:'通知中的参加要求', vector:[.99,.01], text:'通知可以说明参加要求；这不等于写给朋友的邀请语气。' },
  { id:'invitation-001', genre:'invitation', title:'邀请朋友并请求回复', vector:[.9,.1], text:'邀请朋友时，可以用 Please let me know whether you can join us. 请求回复；使用时保留具体活动语境。' },
  { id:'grammar-001', genre:'any', title:'一般现在时的主谓一致', vector:[.1,.9], text:'一般现在时中，He作主语且谓语为go时，通常用goes；不要把这条规则用于will go或did go。' },
];
const args = process.argv.slice(2);
if (args.some(arg => !['--grammar','--no-filter'].includes(arg))) throw new Error('Supported options: --grammar, --no-filter');
const grammar = args.includes('--grammar');
const query = { text:grammar ? 'He go为什么不对？' : '这封邀请信怎样礼貌请求回复？', vector:grammar ? [0,1] : [1,0], genre:'invitation' };
const filter = !args.includes('--no-filter');
const candidates = cards.filter(card => !filter || card.genre === 'any' || card.genre === query.genre);
const ranking = candidates.map(card => ({ id:card.id, genre:card.genre, title:card.title, similarity:cosine(query.vector,card.vector) })).sort((a,b)=>b.similarity-a.similarity);

assert.equal(cosine([1,0],[1,0]),1);
assert.equal(cosine([1,0],[0,1]),0);
assert.throws(()=>cosine([0,0],[1,0]));
assert.throws(()=>cosine([1],[1,0]));
assert.equal(ranking[0].id, grammar ? 'grammar-001' : filter ? 'invitation-001' : 'notice-001');

console.log('手工二维向量教学实验：不是模型输出，不代表真实检索效果，也不生成辅导答案。');
console.log(JSON.stringify({query:query.text,manualQueryVector:query.vector,metadataFilter:filter},null,2));
console.table(ranking.map(row=>({...row,similarity:row.similarity.toFixed(4)})));
console.log(filter ? '体裁过滤保留了邀请材料和通用规则。接下来判断相关性与使用条件，不能把Top-K都推荐给用户。' : '最高相似度来自通知卡片，但当前是邀请信。这是故意构造的失败，用于说明相似度不等于业务适用性。');
