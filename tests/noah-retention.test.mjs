// 続けて使う割合（task 103）の試験。数え方（純関数）・本物の表から集計した数が churn-cohort と一致する事・審査者だけ・5 人未満を出さない事・画面。
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { cohortChurn } from '../lib/churn-cohort.ts';
import { noahRetentionSubscriptions, utcMonthIndex } from '../lib/noah-retention.ts';
import { createNoahRetentionApi } from '../lib/noah-retention-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { screen } from './fixtures/noah/screen.mjs';

/** 2026-12-15 12:00 UTC。今の月は 2026-12（まだ結果が出ていない）。 */
const NOW = Date.UTC(2026, 11, 15, 12);
const at = (year, month, day = 10) => Date.UTC(year, month - 1, day, 9);
const month = (time) => new Date(time).toISOString().slice(0, 7);
const act = (owner, ...times) => times.map((time) => ({ owner, month: month(time), firstAt: time }));

void test('a month with one request counts as continued; a finished month without one ends the run', () => {
  const rows = noahRetentionSubscriptions([
    // 9・10・11 月に頼み、12 月（今の月）はまだ: 続いている。3 か月。
    ...act('steady', at(2026, 9), at(2026, 10), at(2026, 11)),
    // 9・10 月に頼み、11 月（終わった月）に頼まなかった: 10 月の終わりでやめた。
    ...act('stopped', at(2026, 9, 3), at(2026, 10)),
    // 8 月にやめた後、11 月に戻って来た: 最初の続きだけを数える。
    ...act('returned', at(2026, 7), at(2026, 8), at(2026, 11)),
    // 今の月に始めた: 続いている（1 か月目）。
    ...act('new', at(2026, 12, 2)),
  ], [], NOW);
  const byStart = Object.fromEntries(rows.map((row) => [row.startedAt, row]));
  assert.deepEqual(byStart[at(2026, 9)], { arm: 'card', startedAt: at(2026, 9), periodsPaid: 3, endedAt: null });
  assert.deepEqual(byStart[at(2026, 9, 3)], { arm: 'card', startedAt: at(2026, 9, 3), periodsPaid: 2, endedAt: Date.UTC(2026, 10, 1) });
  assert.deepEqual(byStart[at(2026, 7)], { arm: 'card', startedAt: at(2026, 7), periodsPaid: 2, endedAt: Date.UTC(2026, 8, 1) });
  assert.deepEqual(byStart[at(2026, 12, 2)], { arm: 'card', startedAt: at(2026, 12, 2), periodsPaid: 1, endedAt: null });
  assert.equal(rows.length, 4);
});

void test('the group is fixed by the eSIM right at the first request; later eSIM, revoked, expired and future rows stay card', () => {
  const windows = [
    { owner: 'with', from: at(2026, 9, 1), until: null },
    { owner: 'later', from: at(2026, 10, 1), until: null },
    { owner: 'revoked', from: at(2026, 8, 1), until: at(2026, 9, 1) },
    { owner: 'bad', from: at(2026, 8, 1), until: at(2026, 7, 1) },
  ];
  const rows = noahRetentionSubscriptions([
    ...act('with', at(2026, 9)), ...act('later', at(2026, 9)), ...act('revoked', at(2026, 9)), ...act('bad', at(2026, 9)),
    { owner: 'future', month: '2027-01', firstAt: Date.UTC(2027, 0, 2) },
    { owner: 'wrong-month', month: '2026-08', firstAt: at(2026, 9) },
    { owner: '', month: '2026-09', firstAt: at(2026, 9) },
  ], windows, NOW);
  assert.deepEqual(rows.map((row) => row.arm).sort(), ['card', 'card', 'card', 'esim']);
  assert.equal(rows.length, 4);
  assert.equal(utcMonthIndex(NOW), 2026 * 12 + 11);
});

/** 本物の migration の表（0021 の convergence と 0048）を、メモリの SQLite に作り、D1 の形で包む。 */
function database(t) {
  // 依頼の表は接続の表を参照する。この試験は読むだけなので、参照先の表を作らず、参照の確かめを切る。
  const sql = new DatabaseSync(':memory:', { enableForeignKeyConstraints: false });
  t.after(() => sql.close());
  const main = readFileSync(new URL('../drizzle-main/0021_sites_schema_convergence.sql', import.meta.url), 'utf8').split('--> statement-breakpoint');
  for (const name of ['work_jobs', 'agent_delegations', 'esim_device_entitlements', 'rockstar_service_entitlements']) {
    const create = main.find((statement) => statement.trim().startsWith(`CREATE TABLE IF NOT EXISTS \`${name}\` (`));
    assert.ok(create, name);
    sql.exec(create);
  }
  const asks = readFileSync(new URL('../drizzle/0048_noah_asks.sql', import.meta.url), 'utf8').split('--> statement-breakpoint')
    .find((statement) => /CREATE TABLE IF NOT EXISTS noah_asks \(/.test(statement));
  sql.exec(asks.replace(/^[\s\S]*?(CREATE TABLE IF NOT EXISTS noah_asks)/, '$1'));
  const db = {
    prepare(query) {
      const statement = {
        args: [],
        bind(...args) { return { ...statement, args }; },
        async first() { return sql.prepare(query).get(...this.args) ?? null; },
        async all() { return { results: sql.prepare(query).all(...this.args) }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...this.args).changes) } }; },
      };
      return statement;
    },
  };
  let n = 0;
  const id = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const hex = (c) => c.repeat(64);
  return {
    db,
    ask(owner, time) {
      sql.prepare(`INSERT INTO noah_asks (id, owner_id, connection_id, work_id, request_sha256, mode, state, revision, created_at, updated_at, finished_at)
        VALUES (?, ?, 'connection-1', ?, ?, 'agent', 'succeeded', 1, ?, ?, ?)`).run(id(), owner, `work-${n}`, hex('a'), time, time, time);
    },
    local(owner, time) {
      const payload = { templateId: 'noah-agent-local', createdAt: new Date(time).toISOString(), noahExecution: { agentId: 'agent-1', state: 'returned', result: { exitCode: 0 } } };
      sql.prepare('INSERT INTO work_jobs (id, user_id, payload, revision, updated_at) VALUES (?, ?, ?, 1, ?)').run(id(), owner, JSON.stringify(payload), new Date(time).toISOString());
    },
    delegate(owner, time, state = 'remote_completed') {
      sql.prepare(`INSERT INTO agent_delegations (id, owner_user_id, parent_job_id, idempotency_key, message_id, target_origin, target_agent_name, target_agent_version,
        protocol_version, input_sha256, authorization_sha256, budget_currency, budget_limit_minor, deadline_at, state, revision, created_at, updated_at)
        VALUES (?, ?, 'job', ?, ?, 'https://agent.example', 'agent', '1', '1.0', ?, ?, 'JPY', 100, ?, ?, 1, ?, ?)`)
        .run(id(), owner, id(), id(), hex('b'), hex('c'), time + 3600000, state, time, time);
    },
    device(owner, time) {
      sql.prepare(`INSERT INTO esim_device_entitlements (challenge_id, sky_order_id, owner_user_id, profile_digest, device_ref, install_receipt_sha256, authority_id, key_id,
        starter_pack_id, starter_pack_version, starter_pack_manifest_sha256, receipt_sha256, observed_at, activated_at)
        VALUES (?, ?, ?, ?, 'device', ?, 'authority', 'key', 'pack', '1', ?, ?, ?, ?)`).run(id(), id(), owner, hex('d'), hex('e'), hex('f'), hex('1'), time, time);
    },
    claim(owner, time, { status = 'active', formFactor = 'esim', revokedAt = null } = {}) {
      sql.prepare(`INSERT INTO rockstar_service_entitlements (issuer_id, claim_id, owner_user_id, offer_id, purchase_reference_sha256, claim_code_sha256, form_factor,
        scopes_json, issuer_key_id, claim_signature, status, claimed_at, revoked_at)
        VALUES ('issuer', ?, ?, 'offer', ?, ?, ?, '[]', 'key', 'signature', ?, ?, ?)`).run(id(), owner, `a${n.toString(16)}`.padStart(64, '0'), `b${n.toString(16)}`.padStart(64, '0'), formFactor, status, time, revokedAt);
    },
  };
}

function api(db, owner, reviewers = ['operator-1']) {
  return createNoahRetentionApi({ db, now: () => NOW, reviewers, authenticate: async () => { if (!owner) throw Error('UNAUTHORIZED'); return owner; } });
}

void test('the numbers on the review screen equal churn-cohort over the same people, counted once across all request records', async (t) => {
  const f = database(t);
  const expected = [];
  // eSIM を入れて始めた 6 人（端末の利用権 3 人・購入の利用権 3 人）。1 人は 3 つの記録の全部で頼んでいる。
  for (let i = 0; i < 6; i += 1) {
    const owner = `esim-${i}`, start = at(2026, 8, 5 + i);
    if (i < 3) f.device(owner, at(2026, 7)); else f.claim(owner, at(2026, 7));
    f.ask(owner, start);
    f.local(owner, at(2026, 9, 6));
    if (i === 0) { f.delegate(owner, at(2026, 9, 20)); f.ask(owner, at(2026, 9, 21)); }
    if (i % 2 === 0) f.ask(owner, at(2026, 10));
    expected.push({ arm: 'esim', startedAt: start, periodsPaid: i % 2 === 0 ? 3 : 2, endedAt: i % 2 === 0 ? Date.UTC(2026, 10, 1) : Date.UTC(2026, 9, 1) });
  }
  // eSIM なしで始めた 6 人（名前のないブラウザの本人を含む）。1 人は始めた後に eSIM を入れたが、組は card のまま。
  for (let i = 0; i < 6; i += 1) {
    const owner = i === 5 ? 'browser:anonymous-7f3a' : `card-${i}`, start = at(2026, 9, 2 + i);
    f.ask(owner, start);
    if (i === 1) f.claim(owner, at(2026, 9, 25));
    if (i < 2) { f.ask(owner, at(2026, 10)); f.ask(owner, at(2026, 11)); }
    expected.push({ arm: 'card', startedAt: start, periodsPaid: i < 2 ? 3 : 1, endedAt: i < 2 ? null : Date.UTC(2026, 9, 1) });
  }
  // 数えない物: 承認待ちの委任・返金した eSIM・物の SIM。
  f.delegate('waiting', at(2026, 10), 'awaiting_approval');
  f.claim('card-2', at(2026, 8), { status: 'refunded' });
  f.claim('card-3', at(2026, 8), { formFactor: 'physical_sim' });

  const response = await api(f.db, 'operator-1')(new Request('https://avoado.si/api/noah/retention'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store, private');
  const body = await response.json();
  const want = cohortChurn(expected, NOW);
  assert.deepEqual(body.arms, want.arms);
  assert.equal(body.verdict, want.verdict);
  assert.equal(body.arms.esim.people, 6);
  assert.equal(body.arms.card.people, 6);
  assert.equal(body.ownerScope, await ownerScopeFor('operator-1'));
  assert.equal('people' in body, false);
  // 1 人ずつの行や owner は返さない。
  assert.doesNotMatch(JSON.stringify(body), /esim-0|card-1|anonymous/);
});

void test('only reviewers can read it, and a group under five people shows no numbers', async (t) => {
  const f = database(t);
  for (let i = 0; i < 6; i += 1) f.ask(`card-${i}`, at(2026, 10, 3 + i));
  for (let i = 0; i < 4; i += 1) { f.device(`esim-${i}`, at(2026, 9)); f.ask(`esim-${i}`, at(2026, 10, 3 + i)); }
  for (const [owner, reviewers] of [[null, ['operator-1']], ['someone', ['operator-1']]]) {
    const response = await api(f.db, owner, reviewers)(new Request('https://avoado.si/api/noah/retention'));
    assert.equal(response.status, 404);
  }
  const post = await api(f.db, 'operator-1')(new Request('https://avoado.si/api/noah/retention', { method: 'POST' }));
  assert.equal(post.status, 405);
  const body = await (await api(f.db, 'operator-1')(new Request('https://avoado.si/api/noah/retention'))).json();
  assert.equal(body.arms.esim.shown, false);
  assert.equal(body.arms.esim.people, null);
  assert.equal(body.arms.card.people, 6);
  assert.equal(body.verdict, 'insufficient');
});

void test('the review panel shows both groups with their ranges, hides small groups, and says when it cannot tell yet', async () => {
  const shown = { arm: 'card', shown: true, people: 12, trials: 30, cancels: 6, monthlyChurn: 0.2, monthlyChurnCi: { low: 0.095, high: 0.373 }, eligibleFor3Months: 8, retained3Months: 5, retention3Months: 0.625, retention3MonthsCi: { low: 0.306, high: 0.863 } };
  const hidden = { arm: 'esim', shown: false, people: null, trials: null, cancels: null, monthlyChurn: null, monthlyChurnCi: null, eligibleFor3Months: null, retained3Months: null, retention3Months: null, retention3MonthsCi: null };
  const ui = screen({ fetch: async () => ({ body: { asOf: NOW, arms: { esim: hidden, card: shown }, verdict: 'insufficient', minTrialsPerArm: 100, minPeople: 5, ownerScope: 'scope-a' } }) });
  const page = ui.mount('components/noah-retention-review.tsx', { ownerScope: 'scope-a' });
  await page.flush();
  const text = page.text();
  assert.match(text, /続けて使う割合/);
  assert.match(text, /eSIM なしで始めた人/);
  assert.match(text, /人数 12 人/);
  assert.match(text, /月ごとのやめた割合 20\.0%（95% の幅 9\.5%〜37\.3%）/);
  assert.match(text, /3 か月続いた割合 62\.5%/);
  assert.match(text, /5 人未満なので、数を出しません/);
  assert.match(text, /まだ言えない/);

  const quiet = screen({ fetch: async () => ({ status: 404, body: { error: '見つかりません。' } }) });
  const none = quiet.mount('components/noah-retention-review.tsx', { ownerScope: 'scope-a' });
  await none.flush();
  assert.equal(none.text().trim(), '');
});
