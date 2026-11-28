// 掲載中の Agent の説明の日本語の 1 行（data/noah-summary-ja.json・lib/noah-summary-ja.ts）。
// 本人 2026-11-28 17:03「今日ローンチするから大事なことから細部までよろしく」「埋めるだけじゃ意味ないよ」。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahBundledSummaryJa, noahWithSummaryJa } from '../lib/noah-summary-ja.ts';
import { selectNoahDirectory } from '../lib/noah-agent-directory.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { resolveNoahAgentArt } from '../lib/noah-agent-art.ts';
import { loadNoahShareAgent, noahAgentShareMetadata } from '../lib/noah-agent-share.ts';
import { screen } from './fixtures/noah/screen.mjs';

const catalog = JSON.parse(readFileSync(new URL('../data/noah-summary-ja.json', import.meta.url), 'utf8'));
const entries = Object.entries(catalog.series);

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
// 数は「12 000」「2,400」のような区切りを外して比べる。
const numbers = (text) => (text.normalize('NFKC').replace(/(\d)[ ,](?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []);

void test('写しは掲載中の系列ごとに、元の英語の説明と、日本語の 1 行を持つ', () => {
  assert.equal(catalog.schema, 'noah-summary-ja/1');
  assert.ok(entries.length >= 200, `${entries.length} 系列`);
  for (const [id, entry] of entries) {
    assert.match(id, /^mcp-registry:[^\s]+$/, id);
    assert.deepEqual(Object.keys(entry).sort(), ['ja', 'summary'], id);
    assert.ok(entry.summary.trim().length > 0, id);
    assert.ok(entry.ja.trim() === entry.ja && entry.ja.length > 0, id);
    // 取り込みの列（summary_ja）は 200 字まで。カードの 2 行に収まるよう、90 字までにする。
    assert.ok(Array.from(entry.ja).length <= 90, `${id}: ${Array.from(entry.ja).length} 字`);
    assert.match(entry.ja, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, `${id}: 日本語`);
    assert.equal(looksLikeNoahSecret(entry.ja), false, `${id}: 秘密に見える文`);
  }
});

void test('日本語の 1 行は、元の説明に無い数を作らない（1・2 と、英語で数を言葉で書いた物は別）', () => {
  for (const [id, { summary, ja }] of entries) {
    const original = new Set(numbers(summary)), lower = summary.toLowerCase();
    for (const n of numbers(ja)) {
      if (original.has(n)) continue;
      const value = Number(n);
      const spelled = value <= 10 && new RegExp(`\\b${WORDS[value]}\\b`).test(lower);
      assert.ok(value === 1 || value === 2 || spelled, `${id}: 「${n}」が元の説明「${summary}」に無い`);
    }
  }
});

void test('英語の説明が写しの時と 1 字でも違えば、日本語を出さない（英語のまま）', () => {
  const [id, entry] = entries[0];
  assert.equal(noahBundledSummaryJa(id, entry.summary), entry.ja);
  assert.equal(noahBundledSummaryJa(id, `${entry.summary} `), null, '説明が変わった');
  assert.equal(noahBundledSummaryJa('mcp-registry:unknown/agent', entry.summary), null, '写しの無い系列');
  assert.equal(noahBundledSummaryJa('constructor', ''), null, 'prototype の鍵');
  const card = { id, summary: entry.summary, name: 'x' };
  assert.deepEqual(noahWithSummaryJa(card), { ...card, summaryJa: entry.ja });
  assert.equal(noahWithSummaryJa({ ...card, summaryJa: '取り込みが書いた 1 行' }).summaryJa, '取り込みが書いた 1 行', '取り込みの日本語を先に使う');
  const changed = { ...card, summary: 'Changed.' };
  assert.equal(noahWithSummaryJa(changed), changed, '補えない時は、同じ物を返す');
});

void test('検索は、説明の日本語の 1 行にも当たる', () => {
  const [id, entry] = entries.find(([, e]) => e.ja.includes('レストラン'));
  const entryOf = (card) => ({ card: { provider: 'p', topic: 'data', shape: 0, savedIn: [], ...card }, families: [card.id], observedAt: 1 });
  const list = [entryOf({ id, name: 'Discond', summary: entry.summary, summaryJa: entry.ja }), entryOf({ id: 'mcp-registry:other/agent', name: 'Other', summary: 'Weather.' })];
  assert.deepEqual(selectNoahDirectory(list, '', 'レストラン').map((e) => e.card.id), [id]);
  assert.deepEqual(selectNoahDirectory(list, '', 'weather').map((e) => e.card.id), ['mcp-registry:other/agent'], '英語の検索は今までどおり');
});

void test('一覧・詳細・ホームのカードが、日本語の 1 行を使う', () => {
  const api = readFileSync(new URL('../lib/noah-intake-api.ts', import.meta.url), 'utf8');
  assert.match(api, /items: list\.items\.map\(noahWithSummaryJa\)/);
  assert.match(api, /extra\?\.summaryJa \?\? noahBundledSummaryJa\(detail\.id, detail\.summary\)/);
  const directory = readFileSync(new URL('../lib/noah-agent-directory.ts', import.meta.url), 'utf8');
  assert.match(directory, /noahBundledSummaryJa\(row\.id, row\.summary\)/);
  const grid = readFileSync(new URL('../components/noah-pin-grid.tsx', import.meta.url), 'utf8');
  assert.match(grid, /caption=\{locale === 'ja' \? item\.summaryJa \?\? undefined : undefined\}/);
});

function homeScreen(items) {
  return screen({
    fetch: async () => ({ body: { items, nextCursor: null, total: items.length, ownerScope: null } }),
    hostElement: (_type, props) => (props['data-noah-feed-end'] !== undefined ? {} : null),
    IntersectionObserver: class { observe() {} disconnect() {} },
  });
}

void test('ホームのカードは、日本語の 1 行があればそれを、無ければ英語の説明を見せる', async () => {
  const items = [
    { id: 'mcp-registry:a/ja', name: 'Alpha', provider: 'a', summary: 'English summary A.', summaryJa: '日本語の説明 A。', host: 'a.example', topic: 'data', shape: 0, savedIn: [] },
    { id: 'mcp-registry:b/en', name: 'Beta', provider: 'b', summary: 'English summary B.', host: 'b.example', topic: 'data', shape: 1, savedIn: [] },
  ];
  const home = homeScreen(items).mount('components/noah-pin-home.tsx', {});
  await home.flush();
  const text = home.text();
  assert.match(text, /日本語の説明 A。/);
  assert.doesNotMatch(text, /English summary A\./, '日本語がある時は、英語の説明をカードに出さない');
  assert.match(text, /English summary B\./);
});

void test('カードの絵は元の英語の説明で選び、絵の中の字は日本語の 1 行にする（一覧と詳細で同じ絵）', async () => {
  const id = 'mcp-registry:ai.ankra/docs', { summary, ja } = catalog.series[id];
  // 日本語で選ぶと、違う絵になる Agent（資料を探す絵 → 名前の絵）。英語で選べば、一覧と詳細が同じ絵になる。
  assert.notEqual(resolveNoahAgentArt(id, 'Ankra', summary).scene, resolveNoahAgentArt(id, 'Ankra', ja).scene);
  const drawn = [];
  const ui = screen({ modules: { './noah-agent-scene': { NoahAgentScene: (props) => { drawn.push(props); return null; } } } });
  ui.mount('components/noah-art-motion.tsx#NoahPinMotion', { id, name: 'Ankra', summary, caption: ja });
  assert.deepEqual({ ...drawn.at(-1).art }, resolveNoahAgentArt(id, 'Ankra', summary), '絵は英語の説明で選ぶ');
  assert.equal(drawn.at(-1).summary, ja, '絵の中の字');
  ui.mount('components/noah-art-motion.tsx#NoahPinMotion', { id, name: 'Ankra', summary });
  assert.equal(drawn.at(-1).summary, summary, '日本語が無い時は、今までどおり');

  const heroes = [];
  const page = screen({ modules: { './noah-art-motion': { NoahPinMotion: (props) => { heroes.push(props); return null; } } }, fetch: async () => ({ body: {} }) });
  page.mount('components/noah-detail-template.tsx', { id, name: 'Ankra', summary: ja, artSummary: summary });
  assert.equal(heroes.at(-1).summary, summary, '詳細の頭の絵も、英語の説明で選ぶ');
  assert.equal(heroes.at(-1).caption, ja);
  const detail = readFileSync(new URL('../components/noah-ready-detail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /artSummary=\{detail\.summary \|\| undefined\}/);
});

void test('詳細の頭の説明が訳の時は、「自動翻訳 · 原文」を開くと提供者が書いた元の説明が読める（spec-74）', async () => {
  const [id, entry] = entries.find(([, e]) => e.ja.includes('レストラン'));
  const ui = screen({ modules: { './noah-art-motion': { NoahPinMotion: () => null } }, fetch: async () => ({ body: {} }) });
  const page = ui.mount('components/noah-detail-template.tsx', { id, name: 'Discond', summary: entry.ja, original: entry.summary });
  const source = page.find('details').find((node) => JSON.stringify(node.props.children ?? '').includes('原文'));
  assert.ok(source, '訳の時だけ、元の説明を開ける');
  assert.match(page.text(), /自動翻訳 · 原文/);
  assert.ok(page.text().includes(entry.summary), '元の説明は、提供者の文のまま');
  for (const props of [{ summary: entry.summary, original: entry.summary }, { summary: entry.summary }]) {
    const plain = ui.mount('components/noah-detail-template.tsx', { id, name: 'Discond', ...props });
    assert.doesNotMatch(plain.text(), /自動翻訳/, '訳でない時は出さない');
  }
  const detail = readFileSync(new URL('../components/noah-ready-detail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /original=\{translated && lead === translated \? detail\.summary : undefined\}/, 'Noah の案内の説明（guide・starter）の時は出さない');
});

void test('共有のカード（og・twitter・絵）の説明も、日本語の 1 行を使う。英語の説明が変わっていれば英語のまま', async () => {
  const [id, entry] = entries.find(([, e]) => e.ja.includes('レストラン'));
  const listed = (summary) => async () => ({ id, name: 'Discond', summary, provider: 'ae.discond', listed: true });
  const agent = await loadNoahShareAgent(id, { publicListing: true, detail: listed(entry.summary), summaryJa: noahBundledSummaryJa });
  assert.equal(agent.summary, entry.ja);
  const metadata = noahAgentShareMetadata(agent);
  assert.equal(metadata.description, entry.ja);
  assert.equal(metadata.openGraph.description, entry.ja);
  assert.equal(new URL(metadata.openGraph.images[0].url).searchParams.get('v'), '2', '絵が変わったので、SNS に取り直させる');
  const changed = await loadNoahShareAgent(id, { publicListing: true, detail: listed('Changed wording.'), summaryJa: noahBundledSummaryJa });
  assert.equal(changed.summary, 'Changed wording.');
  const server = readFileSync(new URL('../lib/noah-agent-share-server.ts', import.meta.url), 'utf8');
  assert.match(server, /summaryJa: noahBundledSummaryJa/);
  const detail = readFileSync(new URL('../components/noah-ready-detail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /<NoahAgentShare id=\{detail\.id\} name=\{detail\.name\} summary=\{lead\} \/>/, '共有の文は、頁に見せている説明');
  // 同梱の写しは、ブラウザに送る部品から読まない（サーバーだけ）。
  for (const file of ['../lib/noah-agent-share.ts', '../components/noah-agent-pin.tsx', '../components/noah-pin-grid.tsx', '../components/noah-ready-detail.tsx']) {
    assert.doesNotMatch(readFileSync(new URL(file, import.meta.url), 'utf8'), /noah-summary-ja/, file);
  }
});

void test('体調ノートの頁は、共有した時のカード（og・twitter）にも、題と説明を出す', () => {
  const page = readFileSync(new URL('../app/noah/goals/health/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /noahShareMetadata\('\/noah\/goals\/health', \{ title: '体調ノート — Noah'/);
  const share = readFileSync(new URL('../lib/noah-share-metadata.ts', import.meta.url), 'utf8');
  assert.match(share, /const \{ title, description \} = page \?\? NOAH_SHARE_TEXT;/);
  assert.match(share, /openGraph: \{[\s\S]*title,[\s\S]*description,[\s\S]*images/);
});
