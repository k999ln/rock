// task 130: Eve が作った部品（2026-11-24 の確かめで Noah の候補が 0 件だった 3 つの能力）。
// LLM と外の通信は合成の物に差し替える（本物の手元の Qwen で確かめた記録は data/eve-verifications/ にある）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { EVE_PART_FILES } from '../lib/eve-part-registry.ts';
import { eveCheckAccept } from '../lib/eve-combination.ts';
import { EVE_VERIFY_TASKS } from '../lib/eve-verify.ts';
import { eveParseCsv, eveReadResults, eveResultsFormat } from '../lib/eve-part-results.ts';
import { eveWriteScript } from '../lib/eve-part-writer.ts';
import { eveParseKeywordList, eveResearchKeywords } from '../lib/eve-part-research.ts';
import { eveLocalLlm } from '../lib/eve-part-llm.ts';
import { eveCheckAd, eveHtmlText } from '../lib/eve-part-adcheck.ts';
import { eveGroundTerms, eveReadTerms } from '../lib/eve-part-terms.ts';

const task = (capability) => EVE_VERIFY_TASKS.find((t) => t.capability === capability);
const fakeLlm = (text) => async () => ({ text, model: 'fake#0' });

void test('部品 成果・売上を読む: the sample daily CSV passes Jev; nothing is guessed', () => {
  const t = task('tracking.results');
  const out = eveReadResults(t.input);
  assert.deepEqual(
    { clicks: out.clicks, occurred: out.occurred, approved: out.approved, pending: out.pending, approvedYen: out.approvedYen, from: out.from, to: out.to },
    { clicks: 200, occurred: 4, approved: 1, pending: 3, approvedYen: 8_000, from: '2026-11-20', to: '2026-11-21' },
  );
  assert.equal(eveCheckAccept(t.accept, out).ok, true);
  assert.deepEqual(eveReadResults({ '成果の CSV': t.input.csv }), out, 'inside a combination the CSV arrives under its material name');
  assert.throws(() => eveReadResults({ csv: 'a,b\n1,2\n' }), /見出し/u, 'an unknown header is not mapped by guess');
  assert.throws(() => eveReadResults({ csv: '日付,クリック,発生,承認,承認報酬\n2026-11-20,1,1,2,0\n' }), /承認の数/u);
  assert.throws(() => eveReadResults({ csv: t.input.csv, currency: 'USD' }), /円/u);
  assert.throws(() => eveReadResults({ csv: '日付,クリック,発生,承認,承認報酬\n2026-11-20,abc,1,0,0\n' }), /数ではありません/u);
});

void test('部品 成果・売上を読む: Rentracks sales lists (BOM, CRLF, quotes, ¥ and commas); clicks are not measured there', () => {
  const head = 'No,クリック日時,売上日時,売上番号,広告主,プロダクト,売上額,報酬額,状況,期限,承認日,備考,サイトID,サイト名,デバイス,リファラー,拒否理由';
  const csv = `﻿${head}\r\n1,2026/11/01 10:00,2026/11/01 10:05,R-1,"広告主, 株式会社",研修,0,"¥8,000",承認,,2026/11/20,,S1,媒体,PC,,\r\n2,,2026/11/03 09:00,R-2,広告主,研修,0,"8,000円",未承認,,,,S1,媒体,SP,,\r\n3,,2026/11/04 09:00,R-3,広告主,研修,0,8000,拒否,,,,S1,媒体,SP,,重複\r\n`;
  assert.equal(eveResultsFormat(eveParseCsv(csv)[0]), 'rentracks');
  const out = eveReadResults({ csv, currency: 'JPY' });
  assert.deepEqual(
    { clicks: out.clicks, occurred: out.occurred, approved: out.approved, pending: out.pending, rejected: out.rejected, approvedYen: out.approvedYen, pendingYen: out.pendingYen, from: out.from, to: out.to },
    { clicks: null, occurred: 3, approved: 1, pending: 1, rejected: 1, approvedYen: 8_000, pendingYen: 8_000, from: '2026-11-01', to: '2026-11-04' },
  );
  assert.throws(() => eveReadResults({ csv: `${head}\n1,,2026/11/01,R-1,a,b,0,1,承認\n2,,2026/11/01,R-1,a,b,0,1,承認\n` }), /2 回/u, 'the same sale number is counted once only — here it is refused');
  assert.throws(() => eveReadResults({ csv: `${head}\n1,,2026/11/01,R-1,a,b,0,1,確認中\n` }), /読めません/u);
  assert.deepEqual(eveParseCsv('a,"b\nc",d\n"e""f",g,h'), [['a', 'b\nc', 'd'], ['e"f', 'g', 'h']]);
});

void test('部品 台本を書く: four sections in order, the ad label first, headings and quotes dropped, absolute claims refused', async () => {
  const t = task('content.script');
  const sections = [
    '## 見出し\n「法人向けの AI 研修で、どれを選べばいいか迷っていませんか。社内で続けられるかも気になりますよね。」',
    '比べる時は、受講の形と、講座の長さと、質問できる時間を見てください。修了後の支えも大切です。',
    '申し込む前に、料金と解約の決まりを必ずご確認ください。助成金が使えるかも、公式の案内で見ておくと安心です。',
    '無料の説明会があれば二つ以上に出て、自社に合う方を選んでください。',
  ];
  const seq = (list) => { let i = 0; return async () => ({ text: list[i++ % list.length], model: 'fake#0' }); };
  const out = await eveWriteScript(t.input, seq(sections));
  assert.ok(out.text.startsWith('PR\n'), 'the part writes the ad label itself');
  assert.equal(out.text.split('\n').length, 5);
  assert.ok(!out.text.includes('見出し') && !out.text.includes('「'), 'heading lines and wrapping quotes are dropped');
  assert.equal(eveCheckAccept(t.accept, out.text).ok, true);
  await assert.rejects(eveWriteScript(t.input, seq([...sections.slice(0, 3), 'これで必ず成果が出ます。'])), /言い切り/u);
  await assert.rejects(eveWriteScript(t.input, seq(['トップクラスの講座です。', ...sections.slice(1)])), /言い切り/u);
  await assert.rejects(eveWriteScript(t.input, seq(['短い。'])), /長さ/u);
  await assert.rejects(eveWriteScript(t.input, seq(['見出しだけ'])), /空/u);
  await assert.rejects(eveWriteScript({}, seq(sections)), /brief/u);
});

void test('部品 検索の言葉を集める: only words with Wikipedia hits are kept, in the model’s order; fewer than 5 is a failure', async () => {
  const t = task('research.market');
  const words = ['AI 研修 比較', '生成AI 研修 料金', '人材開発支援助成金', 'リスキリング 研修', 'DX 研修 法人', 'プロンプト 研修', 'まったく無い言葉', '法人向け AI 研修', 'english only'];
  const hits = { 'AI 研修 比較': 120, '生成AI 研修 料金': 40, '人材開発支援助成金': 15, 'リスキリング 研修': 300, 'DX 研修 法人': 60, 'プロンプト 研修': 8, 'まったく無い言葉': 0 };
  const calls = [];
  const fakeFetch = async (url) => {
    const w = new URL(url).searchParams.get('srsearch');
    calls.push(w);
    return new Response(JSON.stringify({ query: { searchinfo: { totalhits: hits[w] ?? 0 } } }), { status: 200 });
  };
  const out = await eveResearchKeywords(t.input, { llm: fakeLlm('```json\n' + JSON.stringify(words) + '\n```'), fetch: fakeFetch, now: () => Date.parse('2026-11-24T10:00:00Z') });
  // 2026-11-25 から、並びはモデルが挙げた順（テーマに近い順）。件数の順にすると、広すぎる言葉（例: クラウドファンディング）が先に来た。
  assert.deepEqual(out.keywords, ['AI 研修 比較', '生成AI 研修 料金', '人材開発支援助成金', 'リスキリング 研修', 'DX 研修 法人', 'プロンプト 研修']);
  assert.deepEqual(out.dropped, ['まったく無い言葉']);
  assert.ok(!calls.includes('法人向け AI 研修') && !calls.includes('english only'), 'the topic itself and English-only words are not candidates');
  assert.match(out.evidence[0].source, /^https:\/\/ja\.wikipedia\.org\/w\/index\.php\?search=/u);
  assert.deepEqual(out.evidence.map((k) => k.hits), [120, 40, 15, 300, 60, 8]);
  assert.equal(eveCheckAccept(t.accept, out).ok, true);
  await assert.rejects(eveResearchKeywords(t.input, { llm: fakeLlm(JSON.stringify(words.slice(0, 4))), fetch: fakeFetch }), /5 個に足りません/u);
  await assert.rejects(eveResearchKeywords({ ...t.input, country: 'US' }, { llm: fakeLlm('[]'), fetch: fakeFetch }), /日本/u);
  assert.throws(() => eveParseKeywordList('言葉はありません', 't'), /JSON/u);
});

void test('部品 広告の点検: the sample passes; a missing label, absolute claims and effect claims are each caught', () => {
  const t = task('compliance.check');
  const ok = eveCheckAd(t.input);
  assert.deepEqual([ok.ok, ok.problems, ok.documents], [true, [], 2]);
  assert.equal(eveCheckAd({ text: 'PR\n料金は必ずご確認ください。' }).ok, true, 'advising to check is allowed');
  const bad = eveCheckAd({
    '紹介 LP': '<p>法人向け AI 研修なら、業界一の講座で必ず成果が出ます。</p>',
    制作物: ['広告\n受けるだけで痩せる研修です。', { html: '<script>var PR=1</script><p>トップクラスの講座</p>' }],
  });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.problems.map((p) => [p.document, p.rule]), [
    ['紹介 LP', 'label'], ['紹介 LP', 'claim'], ['紹介 LP', 'claim'],
    ['制作物[0]', 'effect'],
    ['制作物[1].html', 'label'], ['制作物[1].html', 'claim'],
  ]);
  assert.equal(eveHtmlText('<style>.a{}</style><p>広告&amp;PR</p><br>次'), '広告&PR\n次');
  assert.equal(eveHtmlText('<p>&amp;lt;b&amp;gt; と &quot;PR&quot;</p>'), '&lt;b&gt; と "PR"', 'entities are decoded once, never twice');
  assert.throws(() => eveCheckAd({}), /文字がありません/u);
  assert.equal(eveCheckAccept(t.accept, ok).ok, true);
  const gate = { type: 'json', required: ['ok', 'problems'], mustBeTrue: ['ok'] };
  assert.equal(eveCheckAccept(gate, ok).ok, true);
  assert.match(eveCheckAccept(gate, bad).reason, /点検に通っていません/u, 'as a gate, a failed check stops the step');
});

void test('部品 規約を読む: only items whose quote is word for word in the terms are kept; fewer than 3 is a failure', async () => {
  const t = task('research.terms');
  const items = [
    { kind: '登録の条件', item: '18歳以上の個人か国内の法人', quote: '満18歳以上の個人、または日本国内に所在する法人とします' },
    { kind: '登録の条件', item: '本人確認書類を出す', quote: '本人確認書類を提出するものとします' },
    { kind: '禁止', item: '自分で申し込まない', quote: '自ら広告主の商品を申し込む行為' },
    { kind: '支払い', item: '1,000円未満は繰り越し', quote: '支払額の合計が1,000円未満の場合は、翌月以降に繰り越します' },
    { kind: '禁止', item: '作り話', quote: 'SNS への投稿を禁止します' },
    { kind: '登録の条件', item: '引用が短すぎる', quote: '個人' },
    { kind: 'その他', item: '種類が違う', quote: '本人確認書類を提出するものとします' },
  ];
  const out = await eveReadTerms(t.input, { llm: fakeLlm('```json\n' + JSON.stringify(items) + '\n```'), now: () => Date.parse('2026-11-24T10:00:00Z') });
  assert.deepEqual(out.requirements.map((r) => r.item), ['18歳以上の個人か国内の法人', '本人確認書類を出す', '自分で申し込まない', '1,000円未満は繰り越し']);
  assert.equal(out.dropped, 3, 'an invented quote, a too-short quote and an unknown kind are dropped');
  assert.equal(eveCheckAccept(t.accept, out).ok, true);
  assert.equal((await eveReadTerms({ '提供元の規約・登録要件': t.input.terms }, { llm: fakeLlm(JSON.stringify(items)) })).requirements.length, 4, 'inside a combination the terms arrive under their material name');
  await assert.rejects(eveReadTerms(t.input, { llm: fakeLlm(JSON.stringify(items.slice(4))) }), /3 個に足りません/u);
  await assert.rejects(eveReadTerms({ url: 'http://example.com/terms' }, { llm: fakeLlm('[]') }), /https/u);
  const page = '<html><body><h1>利用規約</h1><p>会員は、自ら広告主の商品を申し込む行為をしてはなりません。</p><p>本人確認書類を提出するものとします。</p><p>支払額の合計が1,000円未満の場合は、翌月以降に繰り越します。</p></body></html>';
  const viaUrl = await eveReadTerms({ url: 'https://example.com/terms' }, { llm: fakeLlm(JSON.stringify(items.slice(1, 4))), fetch: async () => new Response(page, { status: 200 }) });
  assert.deepEqual([viaUrl.source, viaUrl.requirements.length], ['https://example.com/terms', 3]);
  assert.throws(() => eveGroundTerms('規約は読めませんでした', 'x'), /JSON/u);
});

void test('部品の LLM: only a local model is called', () => {
  assert.throws(() => eveLocalLlm('https://api.example.com'), /手元/u);
  assert.equal(typeof eveLocalLlm('http://127.0.0.1:8787'), 'function');
});

void test('部品の版: in the newest version of every combination file, each pinned Eve part matches its source code and a passing verification', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
  const records = readdirSync(new URL('../data/eve-verifications/', import.meta.url)).filter((f) => f.endsWith('-parts.json'));
  const passed = records.flatMap((f) => JSON.parse(read(`data/eve-verifications/${f}`)).runs.flatMap((r) => r.parts.filter((p) => p.verification.ok)));
  const files = readdirSync(new URL('../data/eve-combinations/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(read(`data/eve-combinations/${f}`)));
  // 古い版は記録として残す（その時の部品の版を指したまま。実行役は、版の違う部品を呼ばない）。試すのは、id ごとに一番新しい版。
  const newest = [...new Set(files.map((c) => c.id))].map((id) => files.filter((c) => c.id === id).sort((a, b) => b.version - a.version)[0]);
  const pinned = newest.flatMap((c) => c.steps.filter((s) => s.agent?.ref.startsWith('eve-part:')).map((s) => ({ c: c.id, ...s })));
  assert.ok(pinned.length >= 15);
  const caps = JSON.parse(read('data/noah-business-capabilities.json')).verified;
  for (const s of pinned) {
    const p = passed.find((x) => x.ref === s.agent.ref && x.version === s.agent.version);
    assert.ok(p, `${s.c} ${s.id}: the pinned version passed Jev`);
    assert.deepEqual(p.files, EVE_PART_FILES[s.agent.ref].files, `${s.agent.ref}: the verified files are the registry's files`);
    const now = createHash('sha256').update(p.files.map(read).join('\n') + (p.model ? `\nmodel:${p.model}` : '')).digest('hex');
    assert.equal(now, s.agent.version, `${s.c} ${s.id}: ${s.agent.ref} changed since it was verified — verify the new version and pin it in a new version of the combination`);
    assert.ok(caps[s.capability]?.includes(s.agent.ref), `${s.id}: ${s.agent.ref} is listed as verified for ${s.capability}`);
  }
});
