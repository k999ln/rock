// つなげる数を、料金ごとのカードの数にする（task 113）: 無料 6・有料 50。同じカードの中の接続は 1。上限は、新しくつなぐ時にだけ見る。
// 世界は、台帳・合成の接続先・本番と同じ migration の表。つなぐのは、本物の入口（POST /api/noah/connect）。
// 仕様: docs/noah/spec-110-shelf.md の 8 章、codex/tasks/113-noah-plan-limits.md の合格条件。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { createNoahShelfApi } from '../lib/noah-shelf-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { NOAH_PLAN_SOURCE, noahPlanActive } from '../lib/noah-plan.ts';
import { parseNoahShelfFlags } from '../lib/noah-shelf.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as botNotice from '../lib/noah-bot-notice.ts';
import * as formLib from '../lib/noah-form.ts';
import * as readyView from '../lib/noah-ready-view.ts';
import * as surface from '../lib/noah-surface.ts';
import * as shelfView from '../lib/noah-shelf-view.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, OPEN, ORIGIN } from './fixtures/noah/connect-world.mjs';
import { screen } from './fixtures/noah/screen.mjs';

const REVIEWER = 'reviewer-a', MINUTE = 61_000;
const FULL = '無料でつなげるのは 6 個までです。使っていないものを切ると、空きができます。';
/** 有料の本人（試験の読み方。本物の読み方は、本人が決めるまで置かない）。 */
const PAID = new Set(['owner-p']);
const OPEN_PLAN = { open: true, source: async (owner) => PAID.has(owner) };
const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 } } } });
const shaOf = (d) => noahToolSha256({ name: d.name, description: d.description ?? '', inputSchema: d.inputSchema, readOnly: d.annotations?.readOnlyHint === true });

/** 9 つの系列。系列 7 と 8 を、審査者が動かして、2 つの工程をつなぐカード（pkg:pair）にしてある。 */
async function plans(t, planLimits = OPEN_PLAN) {
  const definition = lookup();
  const servers = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [hostOf(i + 1), mcpServer({ tools: [definition] })]));
  const w = await world(t, servers, { reviewers: [REVIEWER], env: { ...OPEN, NOAH_SHELF_PUBLIC: 'true' }, planLimits });
  const waiting = [], reviewer = w.as(REVIEWER, { waitUntil: (work) => { waiting.push(work); } });
  for (const family of [7, 8]) {
    assert.equal((await reviewer.connect(familyId(family), uuid(900 + family))).body.state, 'connected');
    await reviewer.ask({ id: uuid(950 + family), connectionId: uuid(900 + family), form: { tool: 'lookup', toolSha256: await shaOf(definition), input: { query: 'x' } }, screen: 'narrow' });
    await Promise.all(waiting.splice(0));
    w.f.advance(MINUTE);
  }
  const handler = createNoahShelfApi({ db: w.f.db, now: w.f.time, reviewers: [REVIEWER], flags: parseNoahFlags(OPEN), shelfFlags: parseNoahShelfFlags({}), authenticate: async () => REVIEWER });
  const post = async (body) => (await handler(new Request(`${ORIGIN}/api/noah/shelf`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerIntent.ownerScopeFor(REVIEWER) }, body: JSON.stringify(body) }))).json();
  const step = (family, consumes, produces) => ({ ref: { kind: 'family', familyId: familyId(family), tool: 'lookup' }, consumes: [consumes], produces, ownerMinutes: 0 });
  await post({ action: 'put', revision: null, package: {
    schema: 'noah-package/1', id: 'pkg:pair', shelf: 'earn', topic: 'research', title: '調べて、まとめる', promise: 'テーマを渡すと、調べた要点のメモが返ります。', give: 'テーマ', get: 'メモ',
    have: ['topic'], want: 'notes', steps: [step(7, 'topic', 'summary'), step(8, 'summary', 'notes')], checks: [{ id: 'has-notes', text: 'メモが返っている', judge: 'rule' }], position: 1, status: 'draft', revision: 1,
  } });
  assert.equal((await post({ action: 'verify', id: 'pkg:pair', revision: 1 })).status, 'verified');
  w.clear();
  /** その本人として、系列 family につなぐ（packageId: カードから始めた時）。 */
  let n = 0;
  const connect = async (owner, family, packageId) => {
    w.f.advance(MINUTE);
    const a = w.as(owner);
    const plan = await a.plan(familyId(family));
    // 画面の試験の台が作る操作 ID（…0001 から）と重ならないように、500 から。
    return a.raw({ id: uuid(500 + ++n), agentId: familyId(family), planSha256: plan.body.planSha256, ...(packageId ? { packageId } : {}) });
  };
  return { w, connect };
}
const state = (reply) => [reply.status, reply.body.state ?? null, reply.body.error ?? null];

void test('the table: the migration is the contract, and both migration folders carry the same file', () => {
  const contract = readFileSync(new URL('../docs/contracts/noah-shelf-v1.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../drizzle/0053_noah_package_connections.sql', import.meta.url), 'utf8');
  assert.equal(migration, readFileSync(new URL('../drizzle-main/0053_noah_package_connections.sql', import.meta.url), 'utf8'));
  const from = (sql) => sql.slice(sql.indexOf('CREATE TABLE IF NOT EXISTS noah_package_connections'), sql.indexOf('CREATE INDEX IF NOT EXISTS noah_package_connections_package') + 100);
  assert.equal(from(migration), from(contract));
  // 料金の読み方は、本人が決めるまで置かない。読み方が無い間は、切り替えを開けても使わない。
  assert.equal(NOAH_PLAN_SOURCE, null);
  assert.equal(noahPlanActive({ open: true, source: NOAH_PLAN_SOURCE }), false);
});

void test('done (113): a free person connects six cards, the seventh is 409 with the words; a second connection in the same card passes; cutting one makes room', async (t) => {
  const { w, connect } = await plans(t);
  for (const family of [1, 2, 3, 4, 5]) assert.deepEqual(state(await connect('owner-f', family)), [200, 'connected', null], `family ${family}`);
  // 6 枚目は、カード（pkg:pair）から始めた接続。
  assert.deepEqual(state(await connect('owner-f', 7, 'pkg:pair')), [200, 'connected', null]);
  const listed = await w.as('owner-f').list();
  assert.deepEqual(listed.body.cards, { live: 6, limit: 6, plan: 'free' });
  // 同じカードの 2 本目（系列 8）は、カードの数を増やさないので通る。
  assert.deepEqual(state(await connect('owner-f', 8, 'pkg:pair')), [200, 'connected', null]);
  assert.deepEqual((await w.as('owner-f').list()).body.cards, { live: 6, limit: 6, plan: 'free' });
  assert.deepEqual(w.f.sql.prepare('SELECT p.package_id, c.family_key FROM noah_package_connections p JOIN noah_connections c ON c.id = p.connection_id ORDER BY c.family_key').all().map((row) => ({ ...row })),
    [{ package_id: 'pkg:pair', family_key: familyId(7) }, { package_id: 'pkg:pair', family_key: familyId(8) }]);
  // 7 枚目は 409。行を作らない。相手へ送らない。
  const before = w.rows().length, sent = w.net.hosts.length;
  assert.deepEqual(state(await connect('owner-f', 6)), [409, null, FULL]);
  assert.deepEqual([w.rows().length, w.net.hosts.filter((host) => host === hostOf(6)).length - w.net.hosts.slice(0, sent).filter((host) => host === hostOf(6)).length], [before, 0]);
  // 1 枚切ると、つなげる。もうつないである物は、上限を理由に切らない。
  const first = w.rows("owner_id='owner-f' AND family_key=?", familyId(1))[0];
  assert.equal((await w.as('owner-f').act(first.id, 'disconnect', first.revision)).status, 200);
  assert.deepEqual(state(await connect('owner-f', 6)), [200, 'connected', null]);
  assert.equal(w.rows("owner_id='owner-f' AND disconnected_at IS NULL").length, 7);
});

void test('a paid person goes past six; a card that does not hold that agent counts as its own; a malformed card ID is refused', async (t) => {
  const { w, connect } = await plans(t);
  for (const family of [1, 2, 3, 4, 5, 6, 9]) assert.deepEqual(state(await connect('owner-p', family)), [200, 'connected', null], `family ${family}`);
  assert.deepEqual((await w.as('owner-p').list()).body.cards, { live: 7, limit: 50, plan: 'paid' });
  // 系列 1 を持たないカードの ID を付けても、カードの中の接続にはならない。
  for (const family of [1, 2, 3, 4, 5]) await connect('owner-f', family, 'pkg:pair');
  assert.equal(w.f.sql.prepare("SELECT COUNT(*) n FROM noah_package_connections p JOIN noah_connections c ON c.id = p.connection_id WHERE c.owner_id='owner-f'").get().n, 0);
  assert.deepEqual((await w.as('owner-f').list()).body.cards, { live: 5, limit: 6, plan: 'free' });
  assert.equal((await connect('owner-f', 6, 'pkg:Bad')).status, 400);
  assert.equal((await connect('owner-f', 6, 42)).status, 400);
});

void test('closed, or open without a way to read the plan: today\'s limit, no card rows, no card counts', async (t) => {
  for (const limits of [{ open: false, source: OPEN_PLAN.source }, { open: true, source: null }, null]) {
    const { w, connect } = await plans(t, limits);
    for (const family of [1, 2, 3, 4, 5, 6]) assert.equal((await connect('owner-f', family, family === 1 ? 'pkg:pair' : undefined)).body.state, 'connected');
    // 7 本目も、今の上限（50）までは通る。
    assert.deepEqual(state(await connect('owner-f', 7, 'pkg:pair')), [200, 'connected', null]);
    assert.equal(w.f.sql.prepare('SELECT COUNT(*) n FROM noah_package_connections').get().n, 0);
    assert.equal('cards' in (await w.as('owner-f').list()).body, false);
  }
});

const MODULES = { '@/lib/owner-intent': ownerIntent, '@/lib/noah-ready-view': readyView, '@/lib/noah-ask-view': askView, '@/lib/noah-bot-notice': botNotice, '@/lib/noah-form': formLib, '@/lib/noah-surface': surface, '@/lib/noah-shelf-view': shelfView, 'next/image': { default: 'img' }, 'next/navigation': { usePathname: () => '/noah/ready' } };

void test('the screen: "6 個のうち 2 個" on the connected heading, and the detail opened from a card sends the card ID', async (t) => {
  const { w, connect } = await plans(t);
  await connect('owner-f', 1);
  await connect('owner-f', 7, 'pkg:pair');
  const ui = screen({ fetch: w.browser({ user: 'owner-f' }, { env: { ...OPEN, NOAH_SHELF_PUBLIC: 'true' }, reviewers: [REVIEWER], planLimits: OPEN_PLAN }), modules: MODULES, now: w.f.time() });
  const list = ui.mount('components/noah-ready.tsx');
  await list.flush();
  assert.ok(list.text().includes(`${readyView.NOAH_READY_TEXT.connected}6 個のうち 2 個`), list.text());
  // カードから開いた詳細の「接続」は、カードの ID を付けて送る。
  w.f.advance(MINUTE);
  const detail = ui.mount('components/noah-ready-detail.tsx', { id: familyId(8), from: 'pkg:pair' });
  await detail.flush();
  await detail.click('接続');
  const sent = ui.calls.filter((call) => call.method === 'POST' && call.url === '/api/noah/connect').map((call) => call.body);
  assert.deepEqual(sent.map((body) => [body.agentId, body.packageId]), [[familyId(8), 'pkg:pair']]);
  assert.equal(w.rows("owner_id='owner-f' AND family_key=?", familyId(8))[0].state, 'connected');
  // 閉じている時は、見出しに数を出さない。
  const closed = screen({ fetch: w.browser({ user: 'owner-f' }, { env: OPEN, reviewers: [], planLimits: { open: false, source: OPEN_PLAN.source } }), modules: MODULES, now: w.f.time() }).mount('components/noah-ready.tsx');
  await closed.flush();
  assert.ok(!closed.text().includes('個のうち'));
});
