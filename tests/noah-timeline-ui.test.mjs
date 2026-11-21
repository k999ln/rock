import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as contract from '../lib/noah-timeline-feed.ts';
const jsx = (type, props) => ({ type, props });
const post = { id: 'post-fixture', content: 'Synthetic community post', author: { name: 'Test author' }, community: { id: 'community-fixture', name: '試験コミュニティー' }, createdAt: 1, replies: 0, following: true };
const items = contract.mixNoahTimeline(
  [{ id: 'agent', name: 'Synthetic Agent', summary: 'A test record', kind: 'agent', level: 'primary' }],
  [post, { ...post, id: 'ordinary', community: null }],
);
function nodes(tree, result = []) {
  if (Array.isArray(tree)) tree.forEach(child => nodes(child, result));
  else if (tree && typeof tree === 'object') { result.push(tree); nodes(tree.props?.children, result); }
  return result;
}
function text(tree) {
  if (tree == null || typeof tree === 'boolean') return '';
  return typeof tree !== 'object' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : text(tree.props?.children);
}
function render(hash = '#timeline', snapshot = { items, social: { profile: { id: 'test' } }, errors: [] }) {
  const exports = {}, source = readFileSync(new URL('../components/noah-timeline.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules = {
    react: { useState: value => [value, () => {}], useRef: () => ({ current: null }), useEffect() {} },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    '@/lib/noah-research-types': { researchKindLabels: { agent: 'Agent本体候補' } },
    '@/lib/noah-timeline-feed': contract,
    './use-noah-hash': { useNoahHash: () => hash },
    './use-noah-timeline': { useNoahTimeline: mode => { assert.equal(mode, 'public'); return ({ data: snapshot, loading: false, hasMore: false, refresh() {} }); } },
    './use-noah-feedback': { useNoahFeedback: () => ({rows:[],error:'',update(){},reload(){}}) },
    './noah-loading': { default: 'noah-loading' },
    './noah-agent-feedback': { NoahAgentSignals: 'agent-feedback' },
    './noah-shell.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
  };
  runInNewContext(code, { exports, URL, Date, require(name) { assert.ok(name in modules, name); return modules[name]; } });
  return exports.default({ mode: 'public', base: '/noah' });
}
void test('UI defaults to all posts and Agents with one Agent filter link and no tab bar', () => {
  const tree = render(), all = nodes(tree);
  assert.equal(all.filter(node => node.props?.['aria-label'] === 'Noahの統合タイムライン').length, 1);
  const cards = all.filter(node => node.type === 'article');
  assert.deepEqual(cards.map(card => card.props['data-feed-kind']), ['post', 'agent']);
  assert.doesNotMatch(text(tree), /試験コミュニティー|ニュース/);
  assert.ok(!all.some(n=>n.props?.['aria-label']==='タイムラインの種類'));
  assert.ok(all.some(n=>n.props?.href==='/noah#agents' && text(n)==='Agent'));
  assert.ok(!text(tree).includes('すべてに戻る'));
  assert.ok(all.some(n=>n.props?.href==='/noah/activity' && text(n)==='実行中'));
  assert.ok(nodes(render('#agents')).some(n=>n.props?.href==='/noah#timeline' && text(n)==='すべてに戻る'));
  assert.ok(nodes(cards[1]).some(node => node.props?.href === '/noah/agents/agent'));
  assert.ok(nodes(cards[0]).some(node => node.props?.href === '/noah/social?post=ordinary'));
});
void test('Agent filter narrows the same list and retired filters return to all without private management actions', () => {
  for (const [hash, expected] of [['#news', ['post','agent']], ['#agents', ['agent']], ['#communities', ['post','agent']], ['#following', ['post','agent']]]) {
    const all = nodes(render(hash));
    assert.deepEqual(all.filter(node => node.type === 'article').map(node => node.props['data-feed-kind']), expected);
    assert.equal(all.filter(node => node.props?.['aria-label'] === 'Noahの統合タイムライン').length, 1);
    assert.ok(!all.some(node => /\/(connect|execute|stop)$/.test(node.props?.href ?? '')));
  }
});

void test('personal opinions preserve author, full text, attachment and observed reaction counts before catalog entries', () => {
  const opinion = { ...post, id: 'opinion', community: null, content: '試験用の個人の見解。\nよかった点だけでなく、惜しかった点も残す。', attachment: { kind: 'agent', resource: 'test-agent' }, likes: 7, reposts: 2, replies: 3 };
  const tree = render('#timeline', { items: contract.mixNoahTimeline([items.find(i=>i.kind==='agent').agent],[opinion]), social: { profile: { id: 'test' } }, errors: [] });
  const cards = nodes(tree).filter(n=>n.type==='article');
  assert.equal(cards[0].props['data-feed-kind'], 'post');
  const content = nodes(cards[0]).find(n=>n.props?.className==='socialText');
  assert.equal(text(content), opinion.content);
  assert.ok(text(cards[0]).includes('Test author'));
  assert.ok(text(cards[0]).includes('test-agent'));
  assert.equal(text(nodes(cards[0]).find(n=>n.props?.['aria-label']==='いいね・詳細')), '7');
  assert.ok(text(cards[1]).includes('Agent紹介'));
  assert.ok(!text(cards[0]).includes('Agent紹介'));
});
void test('setup, successful empty posts, and failed retrieval are distinct without fabricated opinions', () => {
  const agentItems = items.filter(i=>i.kind==='agent');
  const setup = render('#timeline', { items: agentItems, social: { profile: null, posts: [] }, errors: [] });
  assert.ok(text(setup).includes('公開名を設定できます'));
  const empty = render('#timeline', { items: agentItems, social: { profile: { id: 'test' }, posts: [] }, errors: [] });
  assert.ok(text(empty).includes('表示できる投稿はまだありません'));
  const failed = render('#timeline', { items: agentItems, errors: ['投稿：offline'] });
  assert.ok(text(failed).includes('投稿：offline'));
  assert.ok(!text(failed).includes('表示できる投稿はまだありません'));
  for (const tree of [setup,empty,failed]) assert.equal(nodes(tree).filter(n=>n.props?.['data-feed-kind']==='post').length, 0);
});

void test('Agent feedback appears as a personal opinion with its real reply count and Agent link', () => {
  const opinion={id:'review',agentId:'agent',agentName:'Synthetic Agent',author:'Test reviewer',content:'試験用の実際の感想',createdAt:10,replies:4};
  const tree=render('#timeline',{items:contract.mixNoahTimeline([],[],[opinion]),social:{profile:null},errors:[]});
  const card=nodes(tree).find(n=>n.props?.['data-feed-kind']==='feedback');
  assert.ok(card);assert.ok(text(card).includes(opinion.content));assert.ok(text(card).includes(opinion.author));
  assert.ok(text(card).includes('Synthetic Agent への感想'));
  assert.ok(nodes(card).some(n=>n.props?.href?.startsWith('/noah/feedback/agent')));
  assert.equal(text(nodes(card).find(n=>n.props?.['aria-label']==='返信を見る')), '4');
  assert.ok(!nodes(card).some(n=>n.props?.['aria-label']==='いいね・詳細'));
  assert.ok(!text(tree).includes('表示できる投稿はまだありません'));
});
