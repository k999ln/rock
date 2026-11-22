// 定期便の台帳（task 123）。仕様: docs/noah/spec-123-teikibin-ledger.md の 10 章の表を、上から順に確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNoahTeikibinFlags,
  teikibinClose,
  teikibinCode,
  teikibinIdentityKey,
  teikibinMonth,
  teikibinMonthOf,
  teikibinNewCode,
  teikibinPreviousMonth,
} from '../lib/noah-teikibin.ts';
import { NOW, REVIEWER, teikibinFixture } from './fixtures/noah/teikibin.mjs';

const P1 = '00000000-0000-4000-8000-0000000000a1';
const P2 = '00000000-0000-4000-8000-0000000000a2';
const P3 = '00000000-0000-4000-8000-0000000000a3';
const sums = (values) => ({ income: 0, refund: 0, platform_fee: 0, direct_cost: 0, creator_share: 0, ...values });
const base = { month: '2026-11', form: 'cash', reserveBps: 0, dividendBps: 5000, planPriceMinor: null, contributions: [], people: [] };
const total = (lines, pick) => lines.reduce((sum, line) => sum + pick(line), 0);

void test('close math: shares add up to cash, fees are paid even when the surplus is negative, a zero rate shares nothing, remainders go by ID', () => {
  // 入金 100,000 − 手数料 10,000 − 実費 20,000 − 作った人の分 10,000 − 予備 10,000 − 作業料 5,000 = 余剰 45,000。半分を 3 人で等分。
  const result = teikibinClose({
    ...base,
    reserveBps: 1000,
    sums: sums({ income: 100_000, platform_fee: 10_000, direct_cost: 20_000, creator_share: 10_000 }),
    contributions: [{ id: '00000000-0000-4000-8000-0000000000c1', personId: P1, kind: 'compute', units: 10, rate: 500 }],
    people: [{ id: P1, planOptIn: false }, { id: P2, planOptIn: false }, { id: P3, planOptIn: false }],
  });
  assert.equal(result.settlement.surplusMinor, 45_000);
  assert.equal(result.settlement.dividendPoolMinor, 22_500);
  assert.equal(result.settlement.companyMinor, 22_500);
  assert.deepEqual(result.lines.map((line) => [line.personId, line.feeMinor, line.dividendMinor, line.cashMinor]), [
    [P1, 5000, 7500, 12_500],
    [P2, 0, 7500, 7500],
    [P3, 0, 7500, 7500],
  ]);
  const s = result.settlement;
  assert.equal(total(result.lines, (line) => line.cashMinor) + 10_000 + 30_000 + s.reserveMinor + s.companyMinor, 100_000);

  const zero = teikibinClose({ ...base, dividendBps: 0, sums: sums({ income: 50_000 }), people: [{ id: P1, planOptIn: false }] });
  assert.equal(zero.lines[0].dividendMinor, 0);
  assert.equal(zero.lines[0].payoutState, 'none');
  assert.equal(zero.settlement.companyMinor, 50_000);

  const short = teikibinClose({
    ...base,
    sums: sums({ income: 10_000, direct_cost: 20_000 }),
    contributions: [{ id: '00000000-0000-4000-8000-0000000000c2', personId: P2, kind: 'judgment', units: 1, rate: 5000 }],
    people: [{ id: P1, planOptIn: false }, { id: P2, planOptIn: false }],
  });
  assert.equal(short.settlement.dividendPoolMinor, 0);
  assert.equal(short.settlement.companyShortfallMinor, 15_000);
  assert.deepEqual(short.lines.map((line) => [line.personId, line.feeMinor, line.cashMinor]), [[P1, 0, 0], [P2, 5000, 5000]]);

  const remainder = teikibinClose({ ...base, dividendBps: 10_000, sums: sums({ income: 10 }), people: [{ id: P3, planOptIn: false }, { id: P1, planOptIn: false }, { id: P2, planOptIn: false }] });
  assert.deepEqual(remainder.lines.map((line) => [line.personId, line.dividendMinor]), [[P1, 4], [P2, 3], [P3, 3]]);
  assert.throws(() => teikibinClose({ ...base, sums: sums({ income: 100, refund: 101 }) }), /返金が入金を超えています/);
});

void test('the paid plan is taken only when the share covers the price, and goods months move the share but never the work fee', () => {
  const input = {
    ...base,
    dividendBps: 10_000,
    planPriceMinor: 3000,
    sums: sums({ income: 9000 }),
    contributions: [{ id: '00000000-0000-4000-8000-0000000000c3', personId: P1, kind: 'compute', units: 2, rate: 1000 }],
    people: [{ id: P1, planOptIn: true }, { id: P2, planOptIn: true }, { id: P3, planOptIn: false }],
  };
  // 余剰 7,000 を 3 人で: 2334・2333・2333。値段 3,000 に届かないので、誰も差し引かない。
  const short = teikibinClose(input);
  assert.deepEqual(short.lines.map((line) => line.deductionMinor), [0, 0, 0]);
  assert.deepEqual(short.lines.map((line) => line.paidPlan), [0, 0, 0]);
  // 余剰 18,000 を 3 人で 6,000 ずつ。有料を選んだ 2 人だけ 3,000 を差し引く。
  const cash = teikibinClose({ ...input, sums: sums({ income: 20_000 }) });
  assert.deepEqual(cash.lines.map((line) => [line.deductionMinor, line.paidPlan, line.cashMinor, line.goodsMinor]), [
    [3000, 1, 2000 + 3000, 0],
    [3000, 1, 3000, 0],
    [0, 0, 6000, 0],
  ]);
  assert.equal(cash.deductionsMinor, 6000);
  const goods = teikibinClose({ ...input, form: 'goods', sums: sums({ income: 20_000 }) });
  assert.deepEqual(goods.lines.map((line) => [line.cashMinor, line.goodsMinor, line.payoutState, line.goodsState]), [
    [2000, 3000, 'pending', 'pending'],
    [0, 3000, 'none', 'pending'],
    [0, 6000, 'none', 'pending'],
  ]);
  for (const result of [short, cash, goods]) {
    assert.equal(
      total(result.lines, (line) => line.cashMinor + line.goodsMinor + line.deductionMinor),
      total(result.lines, (line) => line.feeMinor + line.dividendMinor),
    );
  }
});

void test('months, codes, switches and identity keys are read strictly', async () => {
  assert.equal(teikibinMonthOf(NOW), '2026-12');
  assert.equal(teikibinMonthOf(Date.UTC(2026, 10, 30, 15)), '2026-12'); // 11/30 15:00 UTC = 12/1 0:00 JST
  assert.equal(teikibinPreviousMonth('2027-01'), '2026-12');
  assert.equal(teikibinMonth('2026-11', NOW), '2026-11');
  for (const bad of ['2025-12', '2027-01', '2026-13', '2026-1', 202611, null]) assert.throws(() => teikibinMonth(bad, NOW), /月を確かめてください/);
  assert.match(teikibinNewCode(), /^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{4}$/u);
  assert.equal(teikibinCode(' k7qm 2xpa '), 'K7QM-2XPA');
  assert.throws(() => teikibinCode('K7QM-2XP0'), /受け取り番号/);
  assert.deepEqual(parseNoahTeikibinFlags({}), { open: false, key: null, warnings: [] });
  assert.equal(parseNoahTeikibinFlags({ NOAH_TEIKIBIN: 'yes' }).open, false);
  assert.match(parseNoahTeikibinFlags({ NOAH_TEIKIBIN: 'yes' }).warnings[0], /true か false/);
  assert.equal(parseNoahTeikibinFlags({ NOAH_TEIKIBIN_KEY: 'short' }).key, null);
  // 空白・ハイフン・全角の違いでは、同じ口座が別人に見えない。方式が違えば、別の鍵。
  const key = 'k'.repeat(40);
  assert.equal(await teikibinIdentityKey(key, 'bank_account', '０００１ - 123 4567'), await teikibinIdentityKey(key, 'bank_account', '0001-1234567'));
  assert.notEqual(await teikibinIdentityKey(key, 'bank_account', '0001-1234567'), await teikibinIdentityKey(key, 'esim_line', '0001-1234567'));
});

void test('records are idempotent by reference, refuse a different body, and can be recorded again after a void', async (t) => {
  const f = teikibinFixture(t);
  const entry = { action: 'entry', month: '2026-11', kind: 'income', amount: 39_500, source: 'coconala', reference: 'coconala:order-1', note: '3件' };
  const first = await f.operator(entry);
  assert.equal(first.status, 200);
  const again = await f.operator(entry);
  assert.equal(again.body.entry.id, first.body.entry.id);
  const changed = await f.operator({ ...entry, amount: 40_000 });
  assert.equal(changed.status, 409);
  assert.match(changed.body.error, /違う内容/);
  assert.equal((await f.operator({ action: 'void-entry', id: first.body.entry.id, reason: '金額の打ち間違い' })).status, 200);
  f.advance(60_000);
  const fixed = await f.operator({ ...entry, amount: 40_000 });
  assert.equal(fixed.status, 200);
  assert.notEqual(fixed.body.entry.id, first.body.entry.id);
  const detail = await f.call(REVIEWER, 'GET', '?month=2026-11');
  assert.equal(detail.body.sums.income, 40_000);
  assert.deepEqual(detail.body.entries.map((row) => [row.amountMinor, row.voided]), [[40_000, false], [39_500, true]]);
});

void test('closed months are frozen, future months are refused, the running month cannot close, and an earlier month cannot close after a later one', async (t) => {
  const f = teikibinFixture(t);
  await f.member('alice');
  assert.equal((await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 10_000, source: 'noah', reference: 'n-1' })).status, 200);
  assert.equal((await f.operator({ action: 'entry', month: '2027-01', kind: 'income', amount: 10_000, source: 'noah', reference: 'n-2' })).status, 400);
  const running = await f.close('2026-12');
  assert.equal(running.status, 409);
  assert.match(running.body.error, /月が終わってから/);
  assert.equal((await f.close('2026-11')).status, 200);
  const frozen = await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 5, source: 'noah', reference: 'n-3' });
  assert.equal(frozen.status, 409);
  assert.match(frozen.body.error, /締めた月は変えられません/);
  const earlier = await f.close('2026-10');
  assert.equal(earlier.status, 409);
  assert.match(earlier.body.error, /後の月が締めてあります/);
  assert.equal((await f.close('2026-11')).status, 409);
});

void test('only verified people who are not revoked share; one bank account verifies one code; the raw value is never stored; no key means no verification', async (t) => {
  const f = teikibinFixture(t);
  const alice = await f.member('alice', '0001-001-7654321');
  const bob = await f.member('bob');
  const carol = (await f.post('carol', { action: 'join' })).body.person.code;
  const dave = (await f.post('dave', { action: 'join' })).body.person.code;
  // 同じ口座（書き方だけ違う）で、別の番号は確かめない。
  const twice = await f.operator({ action: 'verify', code: dave, method: 'bank_account', identity: '0001 001 7654321' });
  assert.equal(twice.status, 409);
  assert.match(twice.body.error, /この口座は、もう別の受け取り番号/);
  assert.equal((await f.operator({ action: 'revoke', code: bob, reason: '重複の申し込み' })).status, 200);
  for (const row of f.sql.prepare('SELECT * FROM noah_teikibin_people').all()) {
    for (const value of Object.values(row)) assert.doesNotMatch(String(value), /7654321/);
  }
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 10_000, source: 'noah', reference: 'n-1' });
  const closed = await f.close('2026-11', { dividend: 10_000 });
  assert.equal(closed.body.month.people, 1);
  const lines = await f.call(REVIEWER, 'GET', '?payouts=2026-11');
  assert.deepEqual(lines.body.lines.map((line) => [line.code, line.dividendMinor]), [[alice, 10_000]]);
  assert.equal(carol.length, 9);
  const noKey = teikibinFixture(t, { key: null });
  const code = (await noKey.post('erin', { action: 'join' })).body.person.code;
  const refused = await noKey.operator({ action: 'verify', code, method: 'bank_account', identity: '0001-1' });
  assert.equal(refused.status, 503);
  assert.match(refused.body.error, /NOAH_TEIKIBIN_KEY/);
});

void test('a close needs the digest the operator previewed; a record added after the preview refuses it', async (t) => {
  const f = teikibinFixture(t);
  await f.member('alice');
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 10_000, source: 'noah', reference: 'n-1' });
  const preview = await f.call(REVIEWER, 'GET', '?preview=2026-11&form=cash&reserve=0&dividend=5000');
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.body.problems, []);
  assert.equal(preview.body.sample[0].dividendMinor, 5000);
  await f.operator({ action: 'entry', month: '2026-11', kind: 'direct_cost', amount: 2000, source: 'cloud', reference: 'cloud-11' });
  const stale = await f.operator({ action: 'close', month: '2026-11', form: 'cash', reserveBps: 0, dividendBps: 5000, planPrice: null, digest: preview.body.digest });
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /記録が変わりました/);
  const fresh = await f.close('2026-11');
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.month.poolMinor, 4000);
});

void test('an interrupted close resumes from the saved result, even if someone is verified in between', async (t) => {
  const f = teikibinFixture(t);
  for (const owner of ['alice', 'bob', 'carol']) await f.member(owner);
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 9000, source: 'noah', reference: 'n-1' });
  f.hooks.failBatch = () => true;
  const broken = await f.close('2026-11', { dividend: 10_000 });
  assert.equal(broken.status, 503);
  assert.equal(f.sql.prepare("SELECT state FROM noah_teikibin_months WHERE month='2026-11'").get().state, 'closing');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM noah_teikibin_lines').get().n, 0);
  // 止まっている間は、その月に書けない。確かめた人が増えても、締めの結果は変わらない。
  assert.equal((await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 1, source: 'noah', reference: 'n-2' })).status, 409);
  await f.member('dave');
  f.hooks.failBatch = undefined;
  const resumed = await f.operator({ action: 'close', month: '2026-11', form: 'cash', reserveBps: 0, dividendBps: 10_000, planPrice: null, digest: 'f'.repeat(64) });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.month.state, 'closed');
  assert.deepEqual(f.sql.prepare('SELECT dividend_minor AS d FROM noah_teikibin_lines ORDER BY person_id').all().map((row) => row.d), [3000, 3000, 3000]);
});

void test('closing writes many people in bounded batches', async (t) => {
  const f = teikibinFixture(t);
  const insert = f.sql.prepare("INSERT INTO noah_teikibin_people(id, owner_id, code, identity_key, method, verified_by, verified_at, created_at) VALUES (?, ?, ?, ?, 'bank_account', 'op', 1, 1)");
  for (let i = 0; i < 1000; i++) {
    const n = String(i).padStart(4, '0');
    insert.run(`00000000-0000-4000-8000-00000000${n}`, `owner-${n}`, `AAAA-${['2', '3', '4', '5', '6', '7', '8', '9'][i % 8]}${'ABCDEFGH'[Math.floor(i / 8) % 8]}${'JKMNPQRS'[Math.floor(i / 64) % 8]}${'TUVWXYZ2'[Math.floor(i / 512) % 8]}`, n.padStart(64, '0'));
  }
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 1_000_000, source: 'noah', reference: 'n-1' });
  const closed = await f.close('2026-11', { dividend: 10_000 });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.month.people, 1000);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n, SUM(dividend_minor) AS d FROM noah_teikibin_lines').get().d, 1_000_000);
  // 1 文 9 人 → 112 文 → 45 文ずつ 3 回の batch。
  assert.deepEqual(f.batches, [45, 45, 22]);
});

void test('payouts are marked paid once with a unique transfer number; hold, release, goods and the CSV follow the states', async (t) => {
  const f = teikibinFixture(t);
  const alice = await f.member('alice');
  const bob = await f.member('bob');
  await f.operator({ action: 'entry', month: '2026-10', kind: 'income', amount: 4000, source: 'noah', reference: 'n-10' });
  await f.close('2026-10', { dividend: 10_000 });
  const csv = await f.call(REVIEWER, 'GET', '?export=2026-10');
  assert.match(csv.type, /text\/csv/);
  assert.equal(csv.bom, true);
  assert.equal(csv.body, `月,受け取り番号,金額（円）\r\n${[alice, bob].sort((a, b) => a.localeCompare(b)).map((code) => `2026-10,${code},2000`).join('\r\n')}\r\n`);
  assert.equal((await f.operator({ action: 'paid', month: '2026-10', code: alice, payoutRef: 'gmo-0001' })).body.line.payoutState, 'paid');
  assert.equal((await f.operator({ action: 'paid', month: '2026-10', code: alice, payoutRef: 'gmo-0001' })).status, 200);
  const reused = await f.operator({ action: 'paid', month: '2026-10', code: bob, payoutRef: 'gmo-0001' });
  assert.equal(reused.status, 409);
  assert.match(reused.body.error, /もう使われています/);
  assert.equal((await f.operator({ action: 'hold', month: '2026-10', code: bob })).body.line.payoutState, 'held');
  assert.equal((await f.operator({ action: 'paid', month: '2026-10', code: bob, payoutRef: 'gmo-0002' })).status, 409);
  assert.equal((await f.operator({ action: 'release', month: '2026-10', code: bob })).body.line.payoutState, 'pending');
  assert.equal((await f.call(REVIEWER, 'GET', '?export=2026-10')).body, `月,受け取り番号,金額（円）\r\n2026-10,${bob},2000\r\n`);
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 4000, source: 'noah', reference: 'n-11' });
  await f.close('2026-11', { dividend: 10_000, form: 'goods' });
  const goods = await f.operator({ action: 'goods', month: '2026-11', code: alice, assignmentRef: 'dock-assignment-1' });
  assert.equal(goods.body.line.goodsState, 'assigned');
  assert.equal((await f.operator({ action: 'goods', month: '2026-11', code: alice, assignmentRef: 'dock-assignment-2' })).status, 409);
  assert.equal((await f.operator({ action: 'paid', month: '2026-11', code: bob, payoutRef: 'gmo-0003' })).status, 409);
});

void test('people see only closed months; a closed switch hides amounts and refuses joining; reviewers can look before opening', async (t) => {
  const closed = teikibinFixture(t, { open: false });
  assert.deepEqual((await closed.call('alice', 'GET')).body, { open: false, signedIn: true, ownerScope: (await closed.call('alice', 'GET')).body.ownerScope });
  assert.equal((await closed.post('alice', { action: 'join' })).status, 404);
  const preview = await closed.call(REVIEWER, 'GET');
  assert.equal(preview.body.open, true);
  assert.equal(preview.body.reviewerPreview, true);
  assert.deepEqual((await closed.call(null, 'GET')).body, { open: false, signedIn: false });

  const f = teikibinFixture(t);
  const code = await f.member('alice');
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 9000, source: 'coconala', reference: 'c-1' });
  await f.operator({ action: 'entry', month: '2026-12', kind: 'income', amount: 9_000_000, source: 'coconala', reference: 'c-2' });
  await f.close('2026-11', { dividend: 10_000 });
  const mine = await f.call('alice', 'GET');
  assert.equal(mine.body.person.code, code);
  assert.equal(mine.body.person.verified, true);
  // 今の月（締めていない）の 900 万円は、どこにも出ない（R14）。
  assert.deepEqual(mine.body.months.map((m) => [m.month, m.dividendMinor, m.payoutState]), [['2026-11', 9000, 'pending']]);
  assert.doesNotMatch(JSON.stringify(mine.body), /9000000|payoutRef|identity/);
  assert.equal((await f.call('bob', 'GET')).body.person, null);
});

void test('operator actions need a reviewer, the same origin, the owner scope, JSON and a small body', async (t) => {
  const f = teikibinFixture(t);
  const entry = { action: 'entry', month: '2026-11', kind: 'income', amount: 1, source: 'noah', reference: 'n-1' };
  assert.equal((await f.post('alice', entry)).status, 404);
  assert.equal((await f.call('alice', 'GET', '?state=1')).status, 404);
  assert.equal((await f.post(REVIEWER, entry, { origin: 'https://evil.test' })).status, 403);
  assert.equal((await f.post(REVIEWER, entry, { 'X-Rock-Owner-Scope': 'owner-v1:' + '0'.repeat(64) })).status, 409);
  assert.equal((await f.post(REVIEWER, entry, { 'content-type': 'text/plain' })).status, 415);
  const big = await f.post(REVIEWER, { ...entry, note: 'x'.repeat(5000) });
  assert.equal(big.status, 413);
  assert.match(big.body.error, /4 KiB/);
  assert.equal((await f.post(REVIEWER, { ...entry, extra: 1 })).status, 400);
  assert.equal((await f.post(null, { action: 'join' })).status, 401);
});

void test('the paid-plan reader marks only people whose previous month was deducted', async (t) => {
  const f = teikibinFixture(t);
  await f.member('alice');
  await f.member('bob');
  await f.post('alice', { action: 'plan', optIn: true });
  await f.operator({ action: 'entry', month: '2026-11', kind: 'income', amount: 10_000, source: 'noah', reference: 'n-1' });
  const closed = await f.close('2026-11', { dividend: 10_000, price: 3000 });
  assert.equal(closed.status, 200);
  assert.equal(await f.store.paidPlan('alice'), true);
  assert.equal(await f.store.paidPlan('bob'), false);
  assert.equal(await f.store.paidPlan('nobody'), false);
  const view = await f.call('alice', 'GET');
  assert.equal(view.body.planPriceMinor, 3000);
  assert.deepEqual(view.body.months.map((m) => [m.dividendMinor, m.deductionMinor, m.cashMinor, m.paidPlan]), [[5000, 3000, 2000, true]]);
  // 次の月の、その次（2027-01）には、もう有料ではない（毎月、前の月で決まる）。
  f.advance(31 * 86_400_000);
  assert.equal(await f.store.paidPlan('alice'), false);
});

void test('the operator overview promises only what the worst closed month covers', async (t) => {
  const f = teikibinFixture(t);
  await f.member('alice');
  await f.member('bob');
  for (const [month, amount] of [['2026-09', 30_000], ['2026-10', 10_000], ['2026-11', 50_000]]) {
    await f.operator({ action: 'entry', month, kind: 'income', amount, source: 'coconala', reference: `c-${month}` });
    await f.close(month, { dividend: 10_000 });
  }
  const state = await f.call(REVIEWER, 'GET', '?state=1&target=150000');
  assert.equal(state.body.people.verified, 2);
  assert.equal(state.body.coverage.sustainablePerPersonMinor, 5000);
  assert.equal(state.body.coverage.requiredMonthlyPoolMinor, 300_000);
  assert.equal(state.body.coverage.promiseAllowed, false);
  assert.equal(state.body.keyReady, true);
  assert.deepEqual(state.body.months.map((m) => [m.month, m.poolMinor, m.pendingPayouts]), [['2026-11', 50_000, 2], ['2026-10', 10_000, 2], ['2026-09', 30_000, 2]]);
});

// ---------------------------------------------------------------------------
// 画面（9.1 章）
// ---------------------------------------------------------------------------
import { screen } from './fixtures/noah/screen.mjs';
import * as ownerIntent from '../lib/owner-intent.ts';
import { NOAH_MESSAGES } from '../lib/noah-i18n.ts';

const screenModules = { '@/lib/owner-intent': ownerIntent };
const closedMonth = {
  month: '2026-11', form: 'cash', feeMinor: 2000, dividendMinor: 5000, deductionMinor: 3000, cashMinor: 4000, goodsMinor: 0,
  paidPlan: true, payoutState: 'pending', goodsState: 'none', paidAt: null,
};
const member = { open: true, signedIn: true, person: { code: 'K7QM-2XPA', verified: true, revoked: false, planOptIn: true }, planPriceMinor: 3000, months: [closedMonth], ownerScope: 'scope-a' };

void test('the page shows no amounts while closed and no join button', async () => {
  const ui = screen({ modules: screenModules, fetch: async () => ({ body: { open: false, signedIn: true, ownerScope: 'scope-a' } }) });
  const page = ui.mount('components/noah-teikibin.tsx', {});
  await page.flush();
  assert.match(page.text(), /届ける準備をしています/);
  assert.doesNotMatch(page.text(), /[￥¥]|受け取りを申し込む|受け取り番号/);
});

void test('people join from the page with their owner scope and then see their receipt number', async () => {
  let state = { open: true, signedIn: true, person: null, months: [], planPriceMinor: null, ownerScope: 'scope-a' };
  const ui = screen({
    modules: screenModules,
    fetch: async (request) => {
      if (request.method === 'POST') {
        state = { ...state, person: { code: 'K7QM-2XPA', verified: false, revoked: false, planOptIn: false } };
        const { ownerScope: _scope, ...reply } = state;
        return { body: reply };
      }
      return { body: state };
    },
  });
  const page = ui.mount('components/noah-teikibin.tsx', {});
  await page.flush();
  assert.match(page.text(), /まだ締めた月はありません/);
  await page.click('受け取りを申し込む');
  await page.flush();
  const sent = ui.calls.find((call) => call.method === 'POST');
  assert.deepEqual(sent.body, { action: 'join' });
  assert.equal(sent.headers[ownerIntent.OWNER_SCOPE_HEADER], 'scope-a');
  assert.match(page.text(), /K7QM-2XPA/);
  assert.match(page.text(), /運営があなたを確かめると、次の締めから受け取れます/);
});

void test('each closed month is one box with the amount, the parts, the state, and the plan note; other languages are translated', async () => {
  const ui = screen({ modules: screenModules, fetch: async () => ({ body: member }) });
  const page = ui.mount('components/noah-teikibin.tsx', {});
  await page.flush();
  const text = page.text();
  assert.match(text, /2026年11月/);
  assert.match(text, /受け取る額[￥¥]4,000/);
  assert.match(text, /等分[￥¥]5,000/);
  assert.match(text, /差し引き−[￥¥]3,000/);
  assert.match(text, /振込待ち/);
  assert.match(text, /有料の値段: [￥¥]3,000/);
  assert.match(text, /収入として扱われる場合があります/);
  const english = screen({ modules: screenModules, locale: 'en', fetch: async () => ({ body: { ...member, months: [{ ...closedMonth, form: 'goods', cashMinor: 2000, goodsMinor: 2000, goodsState: 'assigned' }] } }) });
  const en = english.mount('components/noah-teikibin.tsx', {});
  await en.flush();
  assert.match(en.text(), /November 2026/);
  assert.match(en.text(), /Transfer pending/);
  assert.match(en.text(), /Delivery items chosen/);
  assert.match(en.text(), /Regular delivery/);
  for (const label of ['振込待ち', '保留', '振込済み', '届ける準備中', '届ける物が決まりました', '受け取りなし']) assert.ok(NOAH_MESSAGES[label], label);
});
