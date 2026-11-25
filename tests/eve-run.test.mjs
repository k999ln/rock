// task 130（2026-11-25）: 残りの部品 6 つ・需要の台帳・本番の実行役。外へ通信しない（LLM と画像は偽物を渡す）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eveCompareOffers, eveOfferFromDemand } from '../lib/eve-part-offers.ts';
import { eveArticleSentences, eveWriteArticle } from '../lib/eve-part-article.ts';
import { EVE_AFFILIATE_PLACEHOLDER, EVE_ARTICLE_LABEL } from '../lib/eve-part-shared.ts';
import { eveEyecatchElement, eveMakeEyecatch } from '../lib/eve-part-image.ts';
import { eveBuildLp } from '../lib/eve-part-lp.ts';
import { eveAffiliateUrl, evePrepareBundle } from '../lib/eve-part-host.ts';
import { eveMarkdownToHtml, evePrepareBlogPost } from '../lib/eve-part-blog.ts';
import { eveCheckAd } from '../lib/eve-part-adcheck.ts';
import { eveReadTerms, eveTermsChunks } from '../lib/eve-part-terms.ts';
import { eveDemandLedger } from '../lib/eve-demand.ts';
import { EVE_DEMAND_FILE, EVE_VERIFIED, eveCatalogEntry, eveCombinationFile } from '../lib/eve-combination-catalog.ts';
import { eveAdvanceRun, eveNewRun, eveRunSummary, eveSubmitOwner } from '../lib/eve-combination-run.ts';
import { eveCheckAccept } from '../lib/eve-combination.ts';
import { EVE_VERIFY_TASKS } from '../lib/eve-verify.ts';

const NOW = Date.parse('2026-11-25T08:00:00Z');
const src = (checkedAt = '2026-11-25T06:35:00Z') => [{ url: 'https://example.com/p', checkedAt }];
const offer = (id, rewardYen, extra = {}) => ({ id, name: `${id} の名前`, condition: '新規契約', rewardYen, place: 'A8.net', sources: src(), ...extra });

void test('案件を比べる: drops what cannot be used and ranks by reward × approval', () => {
  const r = eveCompareOffers({
    asp: 'A8.net',
    offers: [
      offer('a', 2_000),
      offer('b', 3_000, { record: { occurred: 10, approved: 2 } }),
      offer('card', 9_000, { finance: true }),
      offer('other', 9_000, { place: '別の ASP' }),
      offer('old', 9_000, { sources: src('2026-07-01T00:00:00Z') }),
      offer('http', 9_000, { sources: [{ url: 'http://example.com', checkedAt: '2026-11-25T00:00:00Z' }] }),
      offer('zero', 0),
    ],
  }, { now: () => NOW });
  assert.deepEqual(r.offers.map((o) => [o.id, o.expectedYen, o.approvalBasis]), [['a', 1_000, 'prior'], ['b', 750, 'record']]);
  assert.equal(r.chosen, 'a');
  assert.deepEqual(r.dropped.map((d) => d.id).sort(), ['card', 'http', 'old', 'other', 'zero']);
  assert.throws(() => eveCompareOffers({ asp: 'A8.net', offers: [offer('card', 1, { finance: true })] }, { now: () => NOW }), /使える案件がありません/u);
  assert.throws(() => eveCompareOffers({}), /比べる案件/u);
  const fromLedger = eveCompareOffers({ asp: 'A8.net', 需要の台帳: EVE_DEMAND_FILE }, { now: () => NOW });
  assert.equal(fromLedger.chosen, 'affiliate:a8:lolipop-ai-agent-cloud', 'the A8 program is chosen; the in-house program is another place');
  assert.equal(fromLedger.offers[0].name, 'ロリポップ！AIエージェントクラウド');
  assert.equal(eveOfferFromDemand({ ...EVE_DEMAND_FILE[0], origin: 'market' }), null);
});

const fakeLlm = (reply) => async () => ({ text: typeof reply === 'function' ? reply() : reply, model: 'fake#0' });
const sentences = (prefix) => JSON.stringify([
  'まず、目的を書き出して、使う場面を一つずつ思い浮かべながら、毎日の流れのどこに入るかを考えてみましょう。',
  '次に、毎日の作業のどこで使うのかを紙に書いて整理しておくと、比べる時に見る所がはっきりしてきます。',
  'また、困った時にどこへ聞けばよいかも前もって調べておくと、使い始めてからの不安が小さくなります。',
  'たとえば、試しに少しだけ使ってみて手に合うかを確かめると、思っていた使い方との違いに気づけます。',
  'そのうえで、続けられそうかを自分の言葉で考えてみると、選んだ後に後悔しにくい選び方ができます。',
  `最後に、${prefix}について、公式の案内を読みながら、自分に合う物を自分で選んでください。`,
]);

void test('記事を書く: the label, links and offer section are the part’s; risky sentences are dropped', async () => {
  const brief = { 記事の指示: { 指示: '「AIエージェントのクラウド」を比べる記事を書く。', 入れる語: ['料金', '使い方', 'サーバー', '始め方', 'セキュリティ'], 紹介する物: [{ 名前: 'X クラウド', 成果の条件: '新規契約', 報酬: 2_000 }] } };
  const a = await eveWriteArticle(brief, fakeLlm(() => sentences('選び方')));
  assert.ok(a.text.startsWith(`${EVE_ARTICLE_LABEL}\n`), 'the first line is the ad label');
  assert.ok(a.text.includes(`(${EVE_AFFILIATE_PLACEHOLDER})`));
  assert.ok(a.text.includes('## X クラウドを見てみる'));
  assert.ok(eveCheckAccept({ type: 'text', minLength: 1_500, mustInclude: ['PR', EVE_AFFILIATE_PLACEHOLDER] }, a.text).ok);
  assert.equal(eveCheckAd({ 記事: a.text }).ok, true);
  const kept = eveArticleSentences(JSON.stringify(['料金は月額 980 円です。', '業界一の速さです。', 'X クラウドは便利です。', 'この記事は PR です。', 'まず、目的を決めましょう。', '次に、目的を決めましょう。', '比べる時は、自分の使い方を書き出してみましょう。']), ['X クラウド']);
  assert.deepEqual(kept.kept, ['まず、目的を決めましょう。', '比べる時は、自分の使い方を書き出してみましょう。']);
  assert.equal(kept.dropped, 5, 'numbers, claims, the product name, the label and a repeat are dropped');
  await assert.rejects(eveWriteArticle(brief, fakeLlm('["料金は 1 円です。"]')), /2 文残らなかった節が 3 つ/u);
  // 2 つまでの節は欠けてもよい（呼び直さない）。欠けた節は記録に残す。
  let n = 0;
  const two = await eveWriteArticle(brief, fakeLlm(() => (++n <= 2 ? '["一文だけです。"]' : sentences('選び方'))));
  assert.deepEqual(two.skipped, ['書き出し', '選ぶ前に、使う目的を決める']);
  assert.ok(!two.text.includes('## 選ぶ前に、使う目的を決める'));
  await assert.rejects(eveWriteArticle({ 記事の指示: { 指示: '題なし', 紹介する物: [{ 名前: 'X' }] } }, fakeLlm('[]')), /記事の題/u);
});

void test('見出し画像: the title is split at ｜ and the result must be a PNG', async () => {
  const el = eveEyecatchElement('A の選び方｜見る所');
  const texts = el.props.children[1].props.children.map((c) => c.props.children);
  assert.deepEqual(texts, ['A の選び方', '見る所']);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
  const img = await eveMakeEyecatch({ 記事: 'PR\n\n# A の選び方｜見る所\n' }, async () => png);
  assert.deepEqual([img.mime, img.bytes, img.width, img.height, img.alt], ['image/png', 10, 1200, 630, 'A の選び方｜見る所']);
  await assert.rejects(eveMakeEyecatch({ title: 'x' }, async () => new Uint8Array([1, 2, 3])), /PNG/u);
  await assert.rejects(eveMakeEyecatch({ 記事: '題が無い' }, async () => png), /題/u);
});

const lpInput = { '案件・条件': { offers: [{ id: 'a', name: 'A <b>&</b>' }], chosen: 'a' }, 調査結果: { topic: 'AI の道具', keywords: ['料金', '使い方'] } };

void test('紹介の LP: ad label first, placeholder link with rel=sponsored, no scripts, names escaped', () => {
  const html = eveBuildLp(lpInput);
  assert.match(html, /<p class="pr">広告（PR）/u);
  assert.match(html, /href="\{\{AFFILIATE_URL\}\}" rel="sponsored nofollow noopener"/u);
  assert.ok(!/<script/iu.test(html) && !/https?:\/\//u.test(html), 'nothing is loaded from outside');
  assert.ok(html.includes('A &lt;b&gt;&amp;&lt;/b&gt;'));
  assert.equal(eveCheckAd({ '紹介 LP': html }).ok, true);
  assert.throws(() => eveBuildLp({ 調査結果: { topic: 'x' } }), /紹介する案件/u);
});

const passed = { ok: true, problems: [] };
const approval = { affiliateUrl: 'https://px.a8.net/svt/ejp?a8mat=SAMPLE' };

void test('LP を置く用意: only after the ad check, only https links, the link fills the placeholder', async () => {
  const lp = eveBuildLp(lpInput);
  const b = await evePrepareBundle({ '紹介 LP': lp, '広告表示・表現の確認結果': passed, 提携承認または申請結果: approval });
  assert.equal(b.status, 'prepared');
  assert.ok(b.files[0].text.includes('href="https://px.a8.net/svt/ejp?a8mat=SAMPLE"') && !b.files[0].text.includes('{{'));
  assert.equal(b.affiliateHost, 'px.a8.net');
  const again = await evePrepareBundle({ '紹介 LP': lp, '広告表示・表現の確認結果': passed, 提携承認または申請結果: approval });
  assert.equal(again.bundleSha256, b.bundleSha256, 'same input, same bundle');
  await assert.rejects(evePrepareBundle({ '紹介 LP': lp, '広告表示・表現の確認結果': { ok: false, problems: [{}] }, 提携承認または申請結果: approval }), /点検に通っていません/u);
  await assert.rejects(evePrepareBundle({ '紹介 LP': lp, '広告表示・表現の確認結果': passed, 提携承認または申請結果: { affiliateUrl: 'http://px.a8.net/x' } }), /https/u);
  assert.throws(() => eveAffiliateUrl({ affiliateUrl: 'https://x.example/"onclick' }), /形が違います/u);
  assert.throws(() => eveAffiliateUrl({}), /affiliateUrl/u);
});

void test('ブログに出す用意: Markdown to HTML, sponsored link, WXR as a draft', async () => {
  const md = `${EVE_ARTICLE_LABEL}\n\n# 題\n\n本文です。\n\n## 見る所\n\n確かめましょう。\n\n[公式サイトを見る](${EVE_AFFILIATE_PLACEHOLDER})\n`;
  const p = await evePrepareBlogPost({ 記事: md, '広告表示・表現の確認結果': passed, 提携承認または申請結果: approval, '図・画像素材': { sha256: 'ab'.repeat(32), alt: '題' } });
  assert.equal(p.title, '題');
  assert.match(p.html, /<p class="pr">/u);
  assert.match(p.html, /<a href="https:\/\/px\.a8\.net\/svt\/ejp\?a8mat=SAMPLE" rel="sponsored nofollow noopener"/u);
  assert.match(p.wxr, /<wp:status>draft<\/wp:status>/u);
  assert.equal(p.eyecatch?.file, 'eyecatch.png');
  assert.match(p.slug, /^eve-[0-9a-f]{8}$/u);
  assert.throws(() => eveMarkdownToHtml('# t\n\n[x](http://a.example)', 'https://b.example'), /https/u);
  assert.equal(eveMarkdownToHtml('# t\n\nx ]]> y', 'https://b.example').html, '<p>x ]]&gt; y</p>');
  await assert.rejects(evePrepareBlogPost({ 記事: md, '広告表示・表現の確認結果': passed, 提携承認または申請結果: {} }), /affiliateUrl/u);
});

void test('規約を読む: long terms are read in keyword chunks, and every quote is checked against the whole text', async () => {
  const filler = Array.from({ length: 400 }, (_, i) => `第${i}条 この条文は見出しの説明で、ここでは本サービスの名前の由来を述べるものとする。`).join('\n');
  const rules = ['会員は、自己の媒体で自ら申し込む行為をしてはならない。', '報酬の支払は、確定した月の翌々月末日に行うものとする。', '登録の申込は、審査の後に承認されるものとする。'];
  const text = `${filler}\n${rules.join('\n')}`;
  const chunks = eveTermsChunks(text);
  assert.ok(chunks.length >= 1 && chunks.length <= 4 && chunks.every((c) => c.length <= 2_000));
  assert.ok(chunks.join('\n').includes(rules[0]));
  let calls = 0;
  const llm = async () => {
    calls++;
    return { model: 'fake#0', text: JSON.stringify([{ kind: '禁止', item: '自分で申し込まない', quote: rules[0] }, { kind: '支払い', item: '翌々月末', quote: rules[1] }, { kind: '登録の条件', item: '審査', quote: rules[2] }, { kind: '禁止', item: '作り事', quote: '規約に無い文をここに書く' }]) };
  };
  const r = await eveReadTerms({ terms: text }, { llm, now: () => NOW });
  assert.equal(calls, chunks.length);
  assert.equal(r.requirements.length, 3, 'duplicates across chunks are merged');
  assert.ok(r.dropped >= 1, 'a quote that is not in the terms is dropped');
});

void test('需要の台帳: two public sources, both expire after 90 days', () => {
  const now = eveDemandLedger(EVE_DEMAND_FILE, NOW);
  assert.deepEqual(now.entries.map((d) => d.id), ['affiliate:a8:lolipop-ai-agent-cloud', 'affiliate:ai-blogkun:lite-monthly']);
  assert.ok(now.entries.every((d) => d.sources.every((s) => s.url.startsWith('https://')) && !d.finance));
  const later = eveDemandLedger(EVE_DEMAND_FILE, Date.parse('2027-03-01T00:00:00Z'));
  assert.equal(later.entries.length, 0);
  assert.equal(later.rejected.length, 2);
});

const a8 = eveCombinationFile('affiliate:ai-agent-cloud:blog:a8');

void test('A8 の組み合わせ: every automatic step has a verified part, the demand has a source → live', () => {
  const entry = eveCatalogEntry(a8, { verified: EVE_VERIFIED, demand: eveDemandLedger(EVE_DEMAND_FILE, NOW).entries });
  assert.deepEqual(entry.problems.filter((p) => p.level !== 'note'), []);
  assert.equal(entry.status, 'live');
  assert.equal(entry.counts.missing, 0);
  const stale = eveCatalogEntry(a8, { verified: EVE_VERIFIED, demand: [] });
  assert.equal(stale.status, 'paper', 'without a sourced demand it is a dry run again');
});

// 実行役の試験: 部品は偽物（形だけ合う出力）。版は組み合わせに書いた版を返す。
const fakeOutputs = {
  'eve-part:terms-reader': { requirements: [{}, {}, {}] },
  'eve-part:keyword-research': { topic: 'AIエージェントのクラウド', keywords: ['料金', '使い方', 'サーバー', '始め方', 'セキュリティ'] },
  'eve-part:article-writer': `${EVE_ARTICLE_LABEL}\n\n# 題\n\n${'本文です。'.repeat(320)}\n\n[公式](${EVE_AFFILIATE_PLACEHOLDER})\n`,
  'eve-part:eyecatch-image': { mime: 'image/png', bytes: 10, sha256: 'ab'.repeat(32), width: 1200, height: 630, alt: '題', base64: 'iVBORw0KGgo=' },
  'eve-part:static-bundle': { status: 'prepared', entry: 'index.html', files: [{ path: 'index.html' }], bundleSha256: 'cd'.repeat(32) },
  'eve-part:blog-package': { status: 'prepared', title: '題', html: '<p>x</p>', wxr: '<rss/>' },
  'eve-part:results-csv': { clicks: 10, approved: 1, approvedYen: 2_000 },
};
const realParts = { 'eve-part:offer-compare': (input) => eveCompareOffers(input, { now: () => NOW }), 'eve-part:lp-builder': eveBuildLp, 'eve-part:ad-check': eveCheckAd };
function deps(log, overrides = {}) {
  return {
    now: () => NOW,
    versionOf: async (ref) => overrides[ref] ?? a8.steps.find((s) => s.agent?.ref === ref).agent.version,
    call: async (ref, input) => {
      log.push(ref.ref);
      return { output: realParts[ref.ref] ? realParts[ref.ref](input) : fakeOutputs[ref.ref] };
    },
  };
}
const startRun = () => eveNewRun(a8, 'test-run', { テーマ: 'AIエージェントのクラウド', 需要の台帳: eveDemandLedger(EVE_DEMAND_FILE, NOW).entries }, NOW);

void test('実行役: runs real parts until the owner’s turn, then continues from what the owner returns', async () => {
  const log = [];
  let run = await eveAdvanceRun(a8, startRun(), deps(log));
  const state = (id) => run.steps[id].state;
  assert.deepEqual(['rules:asp-a8', 'research', 'offers', 'brief', 'article', 'image', 'lp', 'disclose'].map(state), Array(8).fill('done'));
  assert.equal(state('signup:asp-a8'), 'owner');
  assert.deepEqual(['media:asp-a8', 'apply', 'lp-host', 'publish:blog', 'export:asp-a8', 'track', 'payout'].map(state), Array(7).fill('waiting'));
  assert.equal(run.steps.offers.output.chosen, 'affiliate:a8:lolipop-ai-agent-cloud');
  assert.equal(run.steps.disclose.output.ok, true);
  assert.ok(!log.includes('eve-part:static-bundle') && !log.includes('eve-part:blog-package'), 'nothing goes out before the owner approves');
  const again = await eveAdvanceRun(a8, run, deps(log));
  assert.deepEqual(Object.values(again.steps).map((s) => s.state), Object.values(run.steps).map((s) => s.state), 'the same record stops at the same place');

  await assert.rejects(eveSubmitOwner(a8, run, 'signup:asp-a8', { password: 'x' }, NOW), /受け取りません/u);
  await assert.rejects(eveSubmitOwner(a8, run, 'media:asp-a8', { note: 'x' }, NOW), /本人の番ではありません/u);
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'signup:asp-a8', { note: '登録済みのアカウントを使う' }, NOW), deps(log));
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'media:asp-a8', { note: 'ブログを媒体に登録した' }, NOW), deps(log));
  assert.equal(state('apply'), 'owner');
  await assert.rejects(eveSubmitOwner(a8, run, 'apply', { affiliateUrl: 'http://px.a8.net/x' }, NOW), /https/u);
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'apply', approval, NOW), deps(log));
  assert.equal(state('lp-host'), 'owner', 'the bundle is prepared; the owner puts it online');
  assert.ok(run.steps['lp-host'].prepared && run.steps['lp-host'].output === undefined);
  assert.equal(state('publish:blog'), 'waiting');
  await assert.rejects(eveSubmitOwner(a8, run, 'lp-host', { url: 'http://blog.example/lp' }, NOW), /https/u);
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'lp-host', { url: 'https://blog.example/lp' }, NOW), deps(log));
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'publish:blog', { url: 'https://blog.example/post' }, NOW), deps(log));
  assert.equal(state('export:asp-a8'), 'owner');
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'export:asp-a8', { csv: '日付,クリック,発生,承認,承認報酬\n2026-12-01,10,1,1,2000\n' }, NOW), deps(log));
  assert.deepEqual([state('track'), state('decide'), state('payout')], ['done', 'done', 'owner']);
  assert.equal(run.steps.decide.output.判断, '続ける');
  run = await eveAdvanceRun(a8, await eveSubmitOwner(a8, run, 'payout', { note: 'A8.net の支払明細と銀行の入金 2,000 円が一致' }, NOW), deps(log));
  const sum = eveRunSummary(a8, run);
  assert.equal(sum.finished, true);
  assert.equal(sum.done, a8.steps.length);
  assert.equal(run.owner.length, 7);
  assert.equal(log.filter((r) => r === 'eve-part:article-writer').length, 1, 'each part is called once');
});

void test('実行役: a part whose version changed is not called, and what waits on it stops', async () => {
  const log = [];
  const run = await eveAdvanceRun(a8, startRun(), deps(log, { 'eve-part:article-writer': 'ff'.repeat(32) }));
  assert.equal(run.steps.article.state, 'refused');
  assert.match(run.steps.article.reason, /確かめ直すまで呼びません/u);
  assert.equal(run.steps.image.state, 'waiting');
  assert.ok(!log.includes('eve-part:article-writer'));
  const failing = { ...deps([]), call: async (ref) => { if (ref.ref === 'eve-part:keyword-research') throw new Error('混んでいます'); return deps([]).call(ref, {}); } };
  const r2 = await eveAdvanceRun(a8, startRun(), failing);
  assert.equal(r2.steps.research.state, 'failed');
  assert.match(r2.steps.brief.reason, /止まった/u);
});

void test('確かめる見本の仕事: every capability in the A8 combination has one, and the shapes match the steps', () => {
  const caps = new Set(EVE_VERIFY_TASKS.map((t) => t.capability));
  for (const s of a8.steps.filter((x) => x.agent)) assert.ok(caps.has(s.capability), `${s.capability} has a verify task`);
  const file = JSON.parse(readFileSync(new URL('../data/eve-combinations/affiliate-ai-agent-cloud-blog-a8.json', import.meta.url), 'utf8'));
  assert.equal(file.demand.id, 'affiliate:a8:lolipop-ai-agent-cloud');
});
