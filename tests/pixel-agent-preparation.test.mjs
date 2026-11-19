import test from 'node:test';
import assert from 'node:assert/strict';
import {pixelPortableFixture as fixture} from './helpers/pixel-portable-fixture.mjs';
import {executionDigest} from '../packages/rockstaros-runtime/src/executor.mjs';
async function preparation(f) {
  const recipe = {name: '依頼から作った担当', instructions: '渡された目的と完成条件に従い文章を下書きする。外部操作はしない。', modelId: f.model.id};
  return {agent: {id: crypto.randomUUID(), ...recipe, sha256: await executionDigest(JSON.stringify(recipe))},
    model: {id: f.model.id, scheme: 'gguf-sha256', sha256: f.model.sha256}, deadline: Date.now() + 60000};
}
void test('preparation persists caller identity in existing agent store and exact replay survives restart without inference', async t => {
  const f = await fixture(t), p = await preparation(f);
  assert.deepEqual(await f.manager.prepareTextAgent(p), p.agent);
  assert.equal(f.manager.snapshot().agents.length, 2);
  assert.equal(f.manager.snapshot().runs.length, 0);
  await f.reopen();
  assert.deepEqual(await f.manager.prepareTextAgent(p), p.agent);
  assert.equal(f.manager.snapshot().agents.length, 2);
  assert.equal(f.counters.dispatched, 0);
  const request = {...f.request(), agent: p.agent}, execution = f.manager.executeText(request), child = await f.wait();
  assert.equal(child.request.instructions, p.agent.instructions);
  f.finish(child);
  assert.equal((await execution).text, '合成のPixel成果');
  assert.equal(f.manager.snapshot().runs[0].agent.id, p.agent.id);
});
void test('changed ID content, agent digest, model pin, expiry and extra authority fields cannot register', async t => {
  const f = await fixture(t), p = await preparation(f);
  for (const patch of [
    {agent: {...p.agent, sha256: 'ef'.repeat(32)}},
    {model: {...p.model, sha256: 'ef'.repeat(32)}},
    {model: {...p.model, scheme: 'ollama-manifest-sha256'}},
    {deadline: Date.now() - 1}, {deadline: Date.now() + 180000},
    {agent: {...p.agent, root: true}}, {permission: 'shell'},
  ]) await assert.rejects(f.manager.prepareTextAgent({...p, ...patch}));
  assert.equal(f.manager.snapshot().agents.length, 1);
  await f.manager.prepareTextAgent(p);
  const recipe = {name: p.agent.name, instructions: '別の役割', modelId: p.agent.modelId};
  await assert.rejects(f.manager.prepareTextAgent({...p, agent: {...p.agent, ...recipe, sha256: await executionDigest(JSON.stringify(recipe))}}), {code: 'AGENT_ID_CONFLICT'});
  assert.equal(f.manager.snapshot().agents.length, 2);
  assert.equal(f.counters.dispatched, 0);
});
void test('registration obeys host revocation, busy execution and closed manager without changing agents', async t => {
  const f = await fixture(t), p = await preparation(f);
  f.setExecutionGuard(() => {throw new Error('REVOKED');});
  await assert.rejects(f.manager.prepareTextAgent(p), /REVOKED/);
  f.setExecutionGuard(() => {});
  const execution = f.manager.executeText(f.request()), child = await f.wait();
  await assert.rejects(f.manager.prepareTextAgent(p), {code: 'SKY_LINUX_MANAGER_BUSY'});
  f.finish(child); await execution;
  assert.equal(f.manager.snapshot().agents.length, 1);
  await f.manager.close();
  await assert.rejects(f.manager.prepareTextAgent(p), {code: 'SKY_LINUX_MANAGER_CLOSED'});
});
void test('preparation is a private host port, not a public manager action', async t => {
  const f = await fixture(t), p = await preparation(f);
  await assert.rejects(f.manager.action({action: 'prepareTextAgent', ...p}), /項目/);
  assert.equal(f.manager.snapshot().agents.length, 1);
});
