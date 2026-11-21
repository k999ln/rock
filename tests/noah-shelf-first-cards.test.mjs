// 最初の棚のカード（data/noah-shelf-first-cards.json）の試験。運営の画面の「カードを置く」へ、ファイルの中身をそのまま貼って置く物。
// 形が今の規則（parseNoahPackage）に合う事、どれも「今動かせる物だけ」の範囲（相手のサーバーの道具 1 つ）で、確かめた後に載る事、貼れる大きさである事を確かめる。
// 道具が今も動くか（相手のサーバー）は、ここでは確かめない。それは、本番で審査者が動かして「確かめた」を押す時に確かめる（docs/noah/spec-110-shelf.md の 18 章）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NOAH_SHELVES, NOAH_PROMISE_BLOCKLIST, noahPackageListing, parseNoahPackage } from '../lib/noah-shelf.ts';

const text = readFileSync(new URL('../data/noah-shelf-first-cards.json', import.meta.url), 'utf8');
const cards = JSON.parse(text);
const H = 'a'.repeat(64);

test('最初のカードは、どれも今の規則に合い、下書きで、ID と並びが重ならない', () => {
  assert.ok(Array.isArray(cards) && cards.length >= 15, '15 枚以上');
  for (const card of cards) {
    // 規則を通った物が、置いた物と同じ（項目の足し引きや、直しが要らない）。
    assert.deepEqual(parseNoahPackage(card), card, card.id);
    assert.equal(card.status, 'draft', card.id);
    assert.equal(card.revision, 1, card.id);
    assert.equal(card.verified, undefined, card.id);
  }
  assert.equal(new Set(cards.map((card) => card.id)).size, cards.length, 'ID が重ならない');
  assert.equal(new Set(cards.map((card) => `${card.shelf}:${card.position}`)).size, cards.length, '同じ棚の中で並びが重ならない');
  for (const shelf of NOAH_SHELVES) assert.ok(cards.filter((card) => card.shelf === shelf.id).length >= 4, `${shelf.name}に 4 枚以上`);
});

test('最初のカードは、健康の助言を含まず、金額で誘う語を使わない', () => {
  for (const card of cards) {
    assert.notEqual(card.topic, 'health', card.id);
    assert.equal(card.advice, undefined, card.id);
    for (const word of NOAH_PROMISE_BLOCKLIST) assert.ok(![card.title, card.promise, card.give, card.get].some((line) => line.includes(word)), `${card.id}: ${word}`);
  }
});

test('最初のカードは、相手のサーバーの道具 1 つで終わり、確かめた後は、ローンチの切り替え（つなぐ・家の端末は閉）のままで載る', () => {
  for (const card of cards) {
    assert.equal(card.steps.length, 1, card.id);
    const [step] = card.steps;
    assert.equal(step.ref.kind, 'family', card.id);
    assert.match(step.ref.familyId, /^mcp-registry:[a-z0-9.-]+\/[a-z0-9._-]+$/u, card.id);
    // 確かめる前は、下書きとして載らない。
    const fact = { kind: 'family', listed: true, level: 2, formTool: true, toolSha256: H };
    assert.deepEqual(noahPackageListing(card, [fact], { chains: false, home: false }), { listed: false, reason: 'draft', step: null }, card.id);
    // 審査者が動かして確かめた後（サーバーが今の道具の一覧の hash を入れる）は、載る。
    const verified = parseNoahPackage({ ...card, status: 'verified', verified: { at: 1, runs: 1, fingerprints: [H] }, revision: 2 });
    const listing = noahPackageListing(verified, [fact], { chains: false, home: false });
    assert.equal(listing.listed, true, card.id);
    assert.deepEqual(listing.runs, ['provider'], card.id);
    // 人が動かした記録（L2）が無い間は、確かめた後でも載らない。
    assert.equal(noahPackageListing(verified, [{ ...fact, level: 1 }], { chains: false, home: false }).reason, 'step_not_running', card.id);
  }
});

test('最初のカードは、運営の画面の「カードを置く」の欄（16,000 文字まで）へ、ファイルのまま貼れる', () => {
  assert.ok(text.length <= 16_000, `${text.length} 文字`);
});
