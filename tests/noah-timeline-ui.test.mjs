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
function render(hash = '#timeline') {
  const exports = {}, source = readFileSync(new URL('../components/noah-timeline.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modules = {
    react: { useState: value => [value, () => {}], useRef: () => ({ current: null }), useEffect() {} },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': { default: 'a' },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    '@/lib/noah-research-types': { researchKindLabels: { agent: 'Agent本体候補' } },
    '@/lib/noah-timeline-feed': contract,
    './use-noah-hash': { useNoahHash: () => hash },
    './use-noah-timeline': { useNoahTimeline: mode => { assert.equal(mode, 'public'); return ({ data: { items, social: { profile: { id: 'test' } }, errors: [] }, loading: false, hasMore: false, refresh() {} }); } },
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
