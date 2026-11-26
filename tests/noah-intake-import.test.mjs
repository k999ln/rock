// 手元で計算した取り込みの結果を、本番へ入れる（scripts/noah-local-patrol.mjs → 運営の画面 → POST /api/noah/intake/import）。
// 「手元」の DB で台帳を読み、合成の接続先へ握手し、書き出した物を、別の空の DB（「本番」）へ入れる。入れた後の「本番」で、一覧・詳細・接続・依頼が動く事を確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createIntakeImportApi, noahIntakeExport, noahIntakeImportParts, NOAH_INTAKE_IMPORT_LIMITS } from '../lib/noah-intake-import.ts';
import { createNoahConnectApi } from '../lib/noah-connect.ts';
import { createNoahConnectPlanApi } from '../lib/noah-connect-plan-api.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { splitNoahIntakeImport } from '../lib/noah-intake-import-parts.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { world, familyId, hostOf, uuid, OPEN, ORIGIN } from './fixtures/noah/connect-world.mjs';

const REVIEWER = 'reviewer-a';
const listedIds = async (store) => (await store.list(null, new URLSearchParams())).items.map((item) => item.id).sort();

/** 「本番」: 空の DB に、取り込みの入口だけを置いた物。 */
function production(t, w) {
  const f = fixture(t, w.net.fetch);
  const handler = createIntakeImportApi({ db: f.db, now: f.time, reviewers: [REVIEWER], authenticate: async (request) => { const user = request.headers.get('x-test-user'); if (!user) throw Error('UNAUTHORIZED'); return user; } });
  const send = async (body, { user = REVIEWER, headers = {} } = {}) => {
    const response = await handler(new Request(`${ORIGIN}/api/noah/intake/import`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(user), 'x-test-user': user, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  return { f, send };
}

void test('export from the local run, import into an empty production: the same agents are listed, and people can connect and ask there', async (t) => {
  const lookup = tool('lookup', true, { inputSchema: { type: 'object', required: ['q'], properties: { q: { type: 'string' } } } });
  const w = await world(t, {
    [hostOf(1)]: mcpServer({ tools: [lookup] }), [hostOf(2)]: mcpServer({ tools: [tool('read_thing')] }),
    [hostOf(3)]: mcpServer({ status: 401 }), [hostOf(4)]: mcpServer({ tools: [] }),
  });
  const local = await listedIds(w.f.store);
  assert.deepEqual(local, [familyId(1), familyId(2)]);
  const exported = await noahIntakeExport(w.f.db, w.f.time());
  // 書き出すのは、載せている系列と、その候補・握手の行だけ。
  assert.deepEqual([exported.families.length, exported.candidates.length, exported.checks.length], [2, 2, 2]);
  assert.ok(exported.candidates.every((row) => row.source === 'mcp-registry'));

  const prod = production(t, w);
  let written = 0;
  for (const part of noahIntakeImportParts(exported)) {
    const reply = await prod.send(part);
    assert.equal(reply.status, 200, JSON.stringify(reply.body));
    written += reply.body.rowsWritten;
  }
  assert.ok(written >= 6, `書いた行 ${written}`);
  assert.deepEqual(await listedIds(prod.f.store), local);
  const detail = await prod.f.store.detail(familyId(1), null, false);
  assert.equal(detail.name, 'Agent 1');

  // 入れた「本番」で、つなぐ・頼む（本物の入口）。
  const deps = { ...prod.f.deps, flags: parseNoahFlags(OPEN), reviewers: [], authenticate: async () => 'owner-a' };
  const planApi = createNoahConnectPlanApi(deps), api = createNoahConnectApi(deps);
  const plan = await (await planApi(new Request(`${ORIGIN}/api/noah/connect-plan?agent=${encodeURIComponent(familyId(1))}`))).json();
  const connected = await (await api.collection(new Request(`${ORIGIN}/api/noah/connect`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor('owner-a') }, body: JSON.stringify({ id: uuid(1), agentId: familyId(1), planSha256: plan.planSha256 }) }))).json();
  assert.equal(connected.state, 'connected', JSON.stringify(connected));

  // 同じ物を 2 回入れても、同じ一覧で、本番には 1 行も書かない（候補と握手の行と系列は、中身が変わった物だけを書き換える）。
  const before = prod.f.sql.prepare('SELECT id, revision FROM noah_intake_candidates ORDER BY id').all().map((row) => ({ ...row }));
  const familiesBefore = prod.f.sql.prepare('SELECT id, revision FROM noah_intake_families ORDER BY id').all().map((row) => ({ ...row }));
  for (const part of noahIntakeImportParts(exported)) {
    const reply = await prod.send(part);
    assert.equal(reply.status, 200);
    assert.equal(reply.body.rowsWritten, 0);
  }
  assert.deepEqual(prod.f.sql.prepare('SELECT id, revision FROM noah_intake_candidates ORDER BY id').all().map((row) => ({ ...row })), before);
  assert.deepEqual(prod.f.sql.prepare('SELECT id, revision FROM noah_intake_families ORDER BY id').all().map((row) => ({ ...row })), familiesBefore);
  assert.deepEqual(await listedIds(prod.f.store), local);
  // 手元で、1 時間後にもう一度握手して、台帳も読み直した（確かめた時刻・応答の速さ・見た時刻だけが変わった）。入れ直しても、書かない。
  const later = {
    ...exported,
    candidates: exported.candidates.map((row) => ({ ...row, seen_at: row.seen_at + 3_600_000 })),
    checks: exported.checks.map((row) => ({ ...row, checked_at: row.checked_at + 3_600_000, latency_ms: 5, next_check_at: row.next_check_at + 3_600_000 })),
  };
  for (const part of noahIntakeImportParts(later)) assert.equal((await prod.send(part)).body.rowsWritten, 0);
  // 道具の一覧が変わった時は、書く。
  const changed = { ...later, checks: later.checks.map((row) => ({ ...row, checked_at: row.checked_at + 1, tools_sha256: 'c'.repeat(64) })) };
  let rewritten = 0;
  for (const part of noahIntakeImportParts(changed)) rewritten += (await prod.send(part)).body.rowsWritten;
  assert.equal(rewritten, 2);
  assert.deepEqual(prod.f.sql.prepare('SELECT DISTINCT tools_sha256 FROM noah_intake_checks').all().map((row) => row.tools_sha256), ['c'.repeat(64)]);
});

void test('the export can be narrowed: the families the shelf cards use first, then the easiest to use, up to a count', async (t) => {
  const w = await world(t, {
    [hostOf(1)]: mcpServer({ tools: [tool('lookup')] }), [hostOf(2)]: mcpServer({ tools: [tool('stats')] }), [hostOf(3)]: mcpServer({ tools: [tool('more')] }),
  });
  const all = await noahIntakeExport(w.f.db, w.f.time());
  assert.equal(all.families.length, 3);
  const narrow = await noahIntakeExport(w.f.db, w.f.time(), { limit: 2, first: [familyId(3)] });
  assert.equal(narrow.families.length, 2);
  assert.equal(narrow.families[0].id, familyId(3));
  const ids = new Set(narrow.families.map((row) => row.id));
  assert.ok(narrow.candidates.every((row) => ids.has(row.family_id)));
  assert.equal(narrow.checks.length, narrow.candidates.length);
  assert.ok(narrow.checks.every((row) => narrow.candidates.some((c) => c.id === row.candidate_id)));
  // 書き出した物は、そのまま入れられる。
  const prod = production(t, w);
  for (const part of noahIntakeImportParts(narrow)) assert.equal((await prod.send(part)).status, 200);
  assert.deepEqual(await listedIds(prod.f.store), [...ids].sort((a, b) => (a < b ? -1 : 1)));
  assert.equal((await noahIntakeExport(w.f.db, w.f.time(), { limit: 0 })).families.length, 0);
});

void test('the local "ran" (L2) is not imported as people having run it; production L2 stays while the tools are the same, and drops when they change', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer({ tools: [tool('lookup')] }), [hostOf(2)]: mcpServer({ tools: [tool('stats')] }) });
  w.f.sql.prepare("UPDATE noah_intake_checks SET level=2, l2_at=? WHERE candidate_id=?").run(w.f.time(), familyId(1));
  w.f.sql.prepare("UPDATE noah_intake_families SET level=2, l2_at=?, badge_hint='one_click' WHERE id=?").run(w.f.time(), familyId(1));
  const exported = await noahIntakeExport(w.f.db, w.f.time());
  assert.ok(exported.families.every((row) => row.level === 1 && row.l2_at === null));
  assert.ok(exported.checks.every((row) => row.level === 1 && row.l2_at === null));

  const prod = production(t, w);
  for (const part of noahIntakeImportParts(exported)) await prod.send(part);
  assert.deepEqual(prod.f.sql.prepare('SELECT id, level FROM noah_intake_families ORDER BY id').all().map((row) => [row.id, row.level]), [[familyId(1), 1], [familyId(2), 1]]);
  // 「本番」で人が動かした（L2）。次の取り込みでも、道具の一覧が同じなら L2 のまま。
  prod.f.sql.prepare('UPDATE noah_intake_checks SET level=2, l2_at=5 WHERE candidate_id IN (?, ?)').run(familyId(1), familyId(2));
  prod.f.sql.prepare("UPDATE noah_intake_families SET level=2, l2_at=5, badge_hint='one_click' WHERE id IN (?, ?)").run(familyId(1), familyId(2));
  const later = { ...exported, checks: exported.checks.map((row) => ({ ...row, checked_at: row.checked_at + 1000, tools_sha256: row.candidate_id === familyId(2) ? 'b'.repeat(64) : row.tools_sha256 })) };
  for (const part of noahIntakeImportParts(later)) assert.equal((await prod.send(part)).status, 200);
  assert.deepEqual(prod.f.sql.prepare('SELECT id, level, l2_at FROM noah_intake_families ORDER BY id').all().map((row) => [row.id, row.level, row.l2_at]), [[familyId(1), 2, 5], [familyId(2), 1, null]]);
  assert.deepEqual(prod.f.sql.prepare('SELECT candidate_id, level FROM noah_intake_checks ORDER BY candidate_id').all().map((row) => [row.candidate_id, row.level]), [[familyId(1), 2], [familyId(2), 1]]);
  // 取り下げた系列は、取り込みで戻らない（取り下げの印は、本番の値を残す）。
  prod.f.sql.prepare('UPDATE noah_intake_families SET withdrawn_at=1 WHERE id=?').run(familyId(1));
  for (const part of noahIntakeImportParts(later)) await prod.send(part);
  assert.equal(prod.f.sql.prepare('SELECT withdrawn_at FROM noah_intake_families WHERE id=?').get(familyId(1)).withdrawn_at, 1);
});

void test('only reviewers, from the same Noah, with well-formed rows; listing is recomputed by the production rules', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer({ tools: [tool('lookup')] }) });
  const exported = await noahIntakeExport(w.f.db, w.f.time());
  const [part] = noahIntakeImportParts(exported);
  const prod = production(t, w);
  assert.equal((await prod.send(part, { user: 'owner-b' })).status, 403);
  assert.equal((await prod.send(part, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await prod.send(part, { headers: { 'X-Rock-Owner-Scope': 'stale' } })).status, 409);
  assert.equal((await prod.send(part, { headers: { 'Content-Type': 'text/plain' } })).status, 415);
  const bad = async (change) => (await prod.send({ ...part, ...change })).status;
  assert.equal(await bad({ schema: 'other' }), 400);
  assert.equal((await prod.send('{"schema":')).body.category, 'malformed');
  assert.equal((await prod.send({ ...part, schema: 'other' })).body.category, 'validation');
  const constraint = await prod.send({ ...part, candidates: [{ ...part.candidates[0], name: 'x'.repeat(201) }] });
  assert.equal(constraint.status, 400);
  assert.equal(constraint.body.category, 'db_constraint');
  prod.f.hooks.beforeBatch = () => { throw Error('UNIQUE constraint failed: noah_intake_candidates.source, external_key'); };
  const unique = await prod.send(part);
  assert.equal(unique.status, 400);
  assert.equal(unique.body.category, 'db_constraint');
  prod.f.hooks.beforeBatch = undefined;
  assert.equal(await bad({ families: [] }), 400);
  assert.equal(await bad({ families: [{ ...part.families[0], extra: 1 }] }), 400);
  assert.equal(await bad({ candidates: [{ ...part.candidates[0], source: 'hf-mcp-space' }] }), 400);
  assert.equal(await bad({ families: [{ ...part.families[0], representative_id: 'mcp-registry:someone/else' }] }), 400);
  assert.equal(await bad({ checks: [{ ...part.checks[0], candidate_id: 'mcp-registry:someone/else' }] }), 400);
  assert.equal(await bad({ checks: [{ ...part.checks[0], result: 'bogus' }] }), 400);
  assert.equal(await bad({ families: Array.from({ length: NOAH_INTAKE_IMPORT_LIMITS.families + 1 }, () => part.families[0]) }), 400);
  assert.equal(prod.f.sql.prepare('SELECT COUNT(*) n FROM noah_intake_families').get().n, 0);
  // 書き出した側が「載せる」と言っても、本番の決まりで載せない物は、載せない（鍵の入力が要る候補）。
  const keyed = { ...part, checks: [{ ...part.checks[0], setup: 1 }], families: [{ ...part.families[0], listed: 1 }] };
  assert.deepEqual((await prod.send(keyed)).body.listed, 0);
  assert.equal(prod.f.sql.prepare('SELECT listed FROM noah_intake_families').get().listed, 0);
});

void test('the operator screen sends the file in parts and reports what went in', async (t) => {
  const w = await world(t, { [hostOf(1)]: mcpServer({ tools: [tool('lookup')] }), [hostOf(2)]: mcpServer({ tools: [tool('stats')] }) });
  const exported = await noahIntakeExport(w.f.db, w.f.time());
  const ts = (await import('typescript')).default, { runInNewContext } = await import('node:vm');
  const code = ts.transpileModule(readFileSync(new URL('../components/noah-intake-review.tsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
  const prod = production(t, w), calls = [];
  const snapshot = { sources: [], mouths: { remote: 0, remoteReady: 0, terminal: 0, terminalReady: 0 }, reasons: {}, unsupported: {}, listed: 0, warnings: [], ownerScope: await ownerScopeFor(REVIEWER), families: [], nextOffset: null };
  const fetcher = async (url, init = {}) => {
    calls.push(url);
    if (url.startsWith('/api/noah/intake?')) return Response.json(snapshot);
    const reply = await prod.send(init.body);
    return Response.json(reply.body, { status: reply.status });
  };
  const slots = [], effects = [], exports = {};
  let cursor = 0, tree;
  const jsx = (type, props) => ({ type, props });
  runInNewContext(code, { exports, AbortController, URLSearchParams, Error, Date, JSON, Response, fetch: fetcher,
    require(id) {
      if (id === '@/lib/noah-intake-import-parts') return { splitNoahIntakeImport };
      if (id === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (id.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, name) => String(name) }) };
      if (id === 'react') return {
        useState(value) { const i = cursor++; slots[i] ??= { value }; return [slots[i].value, (v) => { slots[i].value = typeof v === 'function' ? v(slots[i].value) : v; }]; },
        useEffect(fn, deps) { const i = cursor++, previous = slots[i]; if (!previous || deps.some((v, n) => v !== previous.deps[n])) { slots[i] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
      };
      throw Error(id);
    } });
  const render = () => { cursor = 0; tree = exports.default({ ownerScope: snapshot.ownerScope }); effects.splice(0).forEach((fn) => fn()); };
  const walk = (value) => (Array.isArray(value) ? value.flatMap(walk) : value && typeof value === 'object' ? [value, ...walk(value.props?.children)] : []);
  const text = (value) => (Array.isArray(value) ? value.map(text).join('') : value && typeof value === 'object' ? text(value.props?.children) : value == null || typeof value === 'boolean' ? '' : String(value));
  const flush = async () => { for (let n = 0; n < 200; n++) { await new Promise((resolve) => setTimeout(resolve, 2)); render(); if (!text(tree).includes('入れています…') && n > 8) break; } };
  render(); await flush();
  const input = walk(tree).find((node) => node.type === 'input' && node.props.type === 'file');
  assert.ok(input);
  input.props.onChange({ target: { files: [{ text: async () => JSON.stringify(exported) }] } });
  await flush();
  assert.ok(text(tree).includes('入れました：系列 2（一覧に載る物 2）。本番へ書いた行 '), text(tree));
  assert.ok(!text(tree).includes('本番へ書いた行 0（'), text(tree));
  assert.deepEqual(calls.filter((url) => url === '/api/noah/intake/import').length, 1);
  assert.equal(prod.f.sql.prepare('SELECT COUNT(*) n FROM noah_intake_families WHERE listed = 1').get().n, 2);
  // 違うファイルは、送らない。
  input.props.onChange({ target: { files: [{ text: async () => '{"schema":"other"}' }] } });
  await flush();
  assert.ok(text(tree).includes('取り込みの結果のファイルではありません。'));
  slots.forEach((slot) => slot.cleanup?.());
});
