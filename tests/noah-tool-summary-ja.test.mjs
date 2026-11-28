// 道具の説明の日本語の 1 行（data/noah-tool-summary-ja.json・lib/noah-tool-summary-ja.ts）。task 128 の 9.9。
// 本人 2026-11-28 17:03「今日ローンチするから大事なことから細部までよろしく」。「こんな事を頼めます」の説明が提供者の英語のままだった。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahBundledToolSummaryJa, noahWithToolNotesJa } from '../lib/noah-tool-summary-ja.ts';
import { noahPlainUses } from '../lib/noah-detail-plain.ts';
import { noahAgentToolListExplanation } from '../lib/noah-agent-explanation.ts';
import { looksLikeNoahSecret } from '../lib/noah-connect-requirements.ts';
import { renderNoahExplanationFixture } from './fixtures/noah/explanation-markup.mjs';

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const catalog = read('../data/noah-tool-summary-ja.json');
const toolCatalog = read('../data/noah-tool-catalog.json');
const listed = read('../data/noah-summary-ja.json');
const rows = Object.entries(catalog.series).flatMap(([id, byTool]) =>
  Object.entries(byTool).flatMap(([tool, entries]) => entries.map((entry) => ({ id, tool, ...entry }))));
const copiesOf = (id) => {
  const value = Object.hasOwn(toolCatalog.series, id) ? toolCatalog.series[id] : null;
  return value ? (Array.isArray(value) ? value : [value]) : [];
};

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
// 数は「12 000」「2,400」のような区切りを外して比べる。
const numbers = (text) => (text.normalize('NFKC').replace(/(\d)[ ,](?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) ?? []);
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

void test('写しは、掲載中の系列の道具ごとに、道具の定義の写しにある元の説明と、日本語の 1 行を持つ', () => {
  assert.equal(catalog.schema, 'noah-tool-summary-ja/1');
  assert.ok(rows.length >= 700, `${rows.length} 件`);
  for (const row of rows) {
    const where = `${row.id} ${row.tool}`;
    assert.ok(Object.hasOwn(listed.series, row.id), `${where}: 掲載中の系列`);
    assert.ok(copiesOf(row.id).some((copy) => copy.tools.some((tool) => tool.name === row.tool && tool.summary === row.summary)), `${where}: 写しにある説明`);
    assert.deepEqual(Object.keys(row).sort(), ['id', 'ja', 'summary', 'tool'], where);
    assert.ok(row.ja.trim() === row.ja && row.ja.length > 0, where);
    assert.ok(Array.from(row.ja).length <= 120, `${where}: ${Array.from(row.ja).length} 字`);
    assert.match(row.ja, /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u, `${where}: 日本語`);
    assert.equal(looksLikeNoahSecret(row.ja), false, `${where}: 秘密に見える文`);
  }
});

void test('「こんな事を頼めます」に出る最初の 4 つの道具は、掲載中の系列のどの写しでも訳がある', () => {
  let checked = 0;
  for (const id of Object.keys(listed.series)) {
    for (const copy of copiesOf(id)) {
      for (const tool of copy.tools.slice(0, 4)) {
        if (!tool.summary) continue;
        checked++;
        assert.ok(noahBundledToolSummaryJa(id, tool.name, tool.summary), `${id} ${tool.name}`);
      }
    }
  }
  assert.ok(checked >= 700, `${checked} 件`);
});

void test('日本語の 1 行は、元の説明に無い数を作らない（1・2 と、英語で数を言葉で書いた物は別）', () => {
  for (const { id, tool, summary, ja } of rows) {
    const original = new Set(numbers(summary)), lower = summary.toLowerCase();
    for (const n of numbers(ja)) {
      if (original.has(n)) continue;
      const value = Number(n);
      const spelled = value <= 20 && new RegExp(`\\b${WORDS[value]}\\b`).test(lower);
      assert.ok(value === 1 || value === 2 || spelled, `${id} ${tool}: 「${n}」が元の説明「${summary}」に無い`);
    }
  }
});

void test('元の説明と 1 字でも違えば出さない。工程の note は提供者の文のまま残し、訳は noteJa に足す', () => {
  const row = rows[0];
  assert.equal(noahBundledToolSummaryJa(row.id, row.tool, row.summary), row.ja);
  assert.equal(noahBundledToolSummaryJa(row.id, row.tool, `${row.summary} `), null, '説明が変わった');
  assert.equal(noahBundledToolSummaryJa(row.id, 'unknown_tool', row.summary), null, '写しの無い道具');
  assert.equal(noahBundledToolSummaryJa('constructor', 'constructor', ''), null, 'prototype の鍵');
  assert.equal(noahBundledToolSummaryJa(row.id, 'constructor', ''), null, 'prototype の鍵');
  const explanation = { consumes: [], produces: [], steps: [
    { id: 'connect:open', kind: 'tap', label: '接続', after: [], note: 'x' },
    { id: 'tool:0', kind: 'auto', label: row.tool, after: ['connect:open'], note: row.summary },
    { id: 'tool:1', kind: 'auto', label: 'other_tool', after: ['connect:open'], note: 'Other.' },
  ] };
  const translated = noahWithToolNotesJa(explanation, row.id);
  assert.equal(translated.steps[1].noteJa, row.ja);
  assert.equal(translated.steps[1].note, row.summary, '提供者の文は残す');
  assert.equal(translated.steps[0].noteJa, undefined, '道具でない工程には足さない');
  assert.equal(translated.steps[2].noteJa, undefined, '訳の無い道具はそのまま');
  assert.equal(noahWithToolNotesJa(explanation, 'mcp-registry:unknown/agent'), explanation, '補えない時は、同じ物を返す');
  assert.deepEqual(noahPlainUses(translated.steps).map((use) => use.textJa), [row.ja, undefined]);
  const source = readFileSync(new URL('../lib/noah-explanation-source.ts', import.meta.url), 'utf8');
  assert.match(source, /noahWithToolNotesJa\(tooled, subject\.candidateId\)/, '道具の定義の写しと同じ鍵で引く');
});

void test('詳細の「こんな事を頼めます」は、日本語の画面で訳を出し、元の文のありかを 1 行で示す。英語の画面は元の文のまま', async () => {
  const id = 'mcp-registry:ae.discond/discond';
  const [copy] = copiesOf(id);
  const explanation = noahWithToolNotesJa(noahAgentToolListExplanation([], copy.tools), id);
  const first = copy.tools[0];
  const ja = noahBundledToolSummaryJa(id, first.name, first.summary);
  assert.ok(ja);
  const japanese = plain(await renderNoahExplanationFixture('single', { explanation }));
  const uses = japanese.slice(japanese.indexOf('こんな事を頼めます'), japanese.indexOf('使い方'));
  assert.ok(uses.includes(ja), '訳が出る');
  assert.ok(!uses.includes(first.summary), 'カードには英語の説明を重ねて出さない');
  assert.match(uses, /説明は自動翻訳です。提供者が書いた元の文は、下の「操作の流れと道具」にあります。/);
  assert.ok(japanese.lastIndexOf(first.summary) > japanese.indexOf('使い方'), '元の文は、下の工程にそのまま出る');
  const english = plain(await renderNoahExplanationFixture('single', { explanation, locale: 'en' }));
  assert.ok(!english.includes(ja), '英語の画面には訳を出さない');
  assert.ok(english.includes(first.summary));
  assert.doesNotMatch(english, /machine-translated/);
});
