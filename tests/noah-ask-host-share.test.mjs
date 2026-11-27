// task 129 の D2: 1 つの相手（接続先）への依頼の枠を、1 人で使い切れないようにする（抜け道 S2）。
// 相手の枠は、全員合わせて直近 60 秒に 30 回（NOAH_ASK_LIMITS.hostPerMinute）。1 人がその相手へ頼めるのは、その 3 分の 1（10 回）まで。
// 既定では本人の 1 分の上限（perMinute 10）と同じ数なので、本人の上限を上げても（NOAH_ASK_LIMITS の JSON）、1 人は 10 回で止まる事を確かめる。
// 合格（codex/tasks/129-noah-ux-debug.md）: 1 人が 30 回送った後でも、別の人の依頼が通る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { NOAH_ASK_LIMITS, NOAH_ASK_HOST_SHARES, noahAskOwnerHostLimit } from '../lib/noah-limits.ts';
import { NOAH_HOST_BUSY, NOAH_HOST_SHARE_USED, noahAskGate, noahToolSha256 } from '../lib/noah-form.ts';
import { mcpServer, tool } from './fixtures/noah/mcp-server.mjs';
import { OPEN, world, familyId, hostOf, uuid } from './fixtures/noah/connect-world.mjs';

const lookup = () => tool('lookup', true, { description: 'Looks up a player.', inputSchema: { type: 'object', required: ['query'], properties: { query: { type: 'string', maxLength: 200 } } } });
const shaOf = (definition) => noahToolSha256({ name: definition.name, description: definition.description ?? '', inputSchema: definition.inputSchema, readOnly: definition.annotations?.readOnlyHint === true });
const calls = (server) => server.log.filter((request) => request.rpc === 'tools/call').length;

void test('1 人の分は、相手の枠の 3 分の 1（切り捨て、最低 1 回）', () => {
  assert.equal(NOAH_ASK_HOST_SHARES, 3);
  assert.equal(noahAskOwnerHostLimit(NOAH_ASK_LIMITS.hostPerMinute), 10);
  assert.deepEqual([noahAskOwnerHostLimit(15), noahAskOwnerHostLimit(31), noahAskOwnerHostLimit(2), noahAskOwnerHostLimit(1)], [5, 10, 1, 1]);
  const at = (counts, limits) => { const g = noahAskGate({ open: 0, lastMinute: 0, lastDay: 0, hostLastMinute: 0, ...counts }, limits); return g.ok ? 'ok' : `${g.status}:${g.code}`; };
  assert.equal(at({ hostLastMinute: 29, ownerHostLastMinute: 9 }), 'ok');
  assert.equal(at({ hostLastMinute: 10, ownerHostLastMinute: 10 }), '429:share');
  assert.equal(at({ hostLastMinute: 30, ownerHostLastMinute: 10 }), '429:host', '相手の枠が先（全員が待つ）');
  assert.equal(at({ hostLastMinute: 5, ownerHostLastMinute: 5 }, { ...NOAH_ASK_LIMITS, hostPerMinute: 15 }), '429:share', '相手の枠を下げると、1 人の分も下がる');
  assert.equal(at({ hostLastMinute: 9 }), 'ok', '本人の数を渡さない呼び方は、今までどおり');
  assert.equal(noahAskGate({ open: 0, lastMinute: 0, lastDay: 0, hostLastMinute: 10, ownerHostLastMinute: 10 }).message, NOAH_HOST_SHARE_USED);
  assert.notEqual(NOAH_HOST_SHARE_USED, NOAH_HOST_BUSY, '自分の分を使い切った時は、相手が混んでいる時と別の文');
});

void test('1 人が 30 回送った後でも、別の人の依頼が通る（本人の 1 分の上限を 40 に上げても、1 人は 10 回まで）', async (t) => {
  const definition = lookup(), server = mcpServer({ tools: [definition] });
  const env = { ...OPEN, NOAH_ASK_LIMITS: JSON.stringify({ perMinute: 40, open: 40 }) };
  const w = await world(t, { [hostOf(1)]: server }, { env });
  const a = w.as('owner-a'), b = w.as('owner-b');
  assert.equal((await a.connect(familyId(1), uuid(1))).body.state, 'connected');
  assert.equal((await b.connect(familyId(1), uuid(2))).body.state, 'connected');
  w.clear();
  const form = { tool: definition.name, toolSha256: await shaOf(definition), input: { query: 'q' } };

  const replies = [];
  for (let n = 0; n < 30; n++) replies.push(await a.ask({ id: uuid(100 + n), connectionId: uuid(1), form }));
  assert.deepEqual(replies.slice(0, 10).map((reply) => reply.status), Array(10).fill(202));
  assert.deepEqual(replies.slice(10).map((reply) => [reply.status, reply.body.error]), Array(20).fill([429, NOAH_HOST_SHARE_USED]));
  // 断った 20 回は、Work も行も作らず、相手へも送らない。
  assert.deepEqual([w.asked().length, calls(server)], [10, 10]);

  // 別の人は、同じ相手へ頼める（相手の枠 30 のうち、使ったのは 10）。
  assert.equal((await b.ask({ id: uuid(200), connectionId: uuid(2), form })).status, 202);
  assert.deepEqual([w.asked('owner_id=?', 'owner-b').length, calls(server)], [1, 11]);

  // 60 秒たてば、同じ人もまた頼める。
  w.f.advance(61_000);
  assert.equal((await a.ask({ id: uuid(300), connectionId: uuid(1), form })).status, 202);
});
