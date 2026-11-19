import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import test from 'node:test';
import { operationFixture } from './helpers/noah-general-operations-fixture.mjs';
import { noahModelDigest } from '../lib/noah-model-catalog.mjs';
import { canonicalOperationValue, operationRunId } from '../lib/noah-operation-contract.mjs';
import { generalOperationsMiddleware } from '../scripts/noah-general-operations.mjs';
import { createNoahWork, executionInputDigest, NoahExecutionError } from '../lib/noah-execution.ts';
import { validateOperationRun } from '../lib/noah-operations.ts';

const digest = binding => createHash('sha256').update(canonicalOperationValue(binding)).digest('hex');
const intent = p => ({ revision: p.runtime.revision, commandId: randomUUID(), candidateDigest: p.runtime.candidateDigest, confirmation: 'noah-operation-runtime/1' });
async function fixture(t, options) {
  const f = operationFixture(options); t.after(() => f.close());
  const c = f.config(); await f.manager.start(f.scope, c, f.client); await f.tick(); await f.manager.stop(f.scope, c.id, f.client);
  const job = await f.service.get(f.user, c.id);
  // Simulate the persisted pre-model-manager format, not a different runtime.
  delete job.noahOperation.bindings; delete job.noahOperation.bindingVersion;
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job), c.id);
  f.runtime.execution.modelSha256 = noahModelDigest(job.noahOperation.binding.model);
  return { ...f, id: c.id, before: job, preview: () => f.manager.runtimePreview(f.scope, c.id, f.client), update: i => f.manager.updateRuntime(f.scope, c.id, i, f.client) };
}
void test('legacy operation explicitly upgrades in place; counters, original Work and conditions survive; no automatic execution', async t => {
  const f = await fixture(t), oldWork = await f.store.get(f.user, operationRunId(f.id, 1));
  await assert.rejects(f.manager.resume(f.scope, f.id, f.client), { status: 409 });
  const p = await f.preview(); assert.equal(p.runtime.current.modelSha256, undefined); assert.ok(p.runtime.candidate.modelSha256);
  const input = intent(p), { job } = await f.update(input), op = job.noahOperation;
  assert.equal(job.id, f.id); assert.equal(op.state, 'paused'); assert.equal(op.leaseSha256, undefined); assert.equal(op.nextRunAt, null);
  assert.equal(op.bindingVersion, 2); assert.equal(op.bindings[0].binding.modelSha256, undefined);
  for (const k of ['config','configs','history','attempts','succeeded','requestSha256']) assert.deepEqual(op[k], f.before.noahOperation[k]);
  await f.tick(); assert.equal(f.runs.length, 1);
  await f.manager.resume(f.scope, f.id, f.client); await f.tick(); assert.equal(f.runs.length, 1);
  f.time.now += 60000; await f.tick(); assert.equal(f.runs.length, 2);
  const newer = await f.store.get(f.user, operationRunId(f.id, 2));
  assert.equal(newer.noahExecution.operation.bindingVersion, 2); assert.equal(newer.noahExecution.modelSha256, op.binding.modelSha256);
  assert.deepEqual(await f.store.get(f.user, oldWork.id), oldWork);
  assert.equal((await f.service.get(f.user, f.id)).noahOperation.history[1].bindingVersion, 2);
  // A lost save acknowledgement must not pause a subsequently resumed plan.
  assert.equal((await f.update(input)).job.noahOperation.state, 'enabled');
});
void test('stale candidate, stale revision, wrong owner and altered retry cannot overwrite another change', async t => {
  const f = await fixture(t), p = await f.preview(), input = intent(p);
  f.runtime.execution.image = `sha256:${'b'.repeat(64)}`;
  await assert.rejects(f.update(input), { status: 409 }); assert.equal((await f.service.get(f.user, f.id)).revision, f.before.revision);
  const fresh = intent(await f.preview()); const saved = await f.update(fresh);
  await assert.rejects(f.update({ ...input, commandId: randomUUID() }), { status: 409 });
  await assert.rejects(f.update({ ...fresh, candidateDigest: 'f'.repeat(64) }), { status: 409 });
  await assert.rejects(f.service.command('bob', { ...fresh, id: f.id, action: 'rebind', binding: p.runtime.candidate }), { status: 404 });
  assert.equal((await f.service.get(f.user, f.id)).revision, saved.job.revision);
});
void test('retry after lost response resolves the same command without requiring the disconnected runtime', async t => {
  const f = await fixture(t), input = intent(await f.preview()), saved = await f.update(input);
  const original = f.executions.binding.bind(f.executions);
  f.executions.binding = async () => { throw new Error('offline'); };
  assert.deepEqual(JSON.parse(JSON.stringify((await f.update(input)).job)), JSON.parse(JSON.stringify(saved.job)));
  f.executions.binding = original;
  assert.equal((await f.service.get(f.user, f.id)).noahOperation.bindings.length, 2);
});
void test('concurrent runtime edits use compare-and-swap and retain one new version', async t => {
  const f = await fixture(t), p = await f.preview(), inputs = [intent(p), intent(p)];
  const results = await Promise.allSettled(inputs.map(i => f.update(i)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal((await f.service.get(f.user, f.id)).noahOperation.bindings.length, 2);
});
void test('delayed save acknowledgement never detaches a subsequent explicit resume', async t => {
  const f = await fixture(t), input = intent(await f.preview());
  const client = { ...f.client, async api(action, value) {
    const result = await f.client.api(action, value);
    if (action === 'rebind') await f.manager.resume(f.scope, f.id, f.client);
    return result;
  } };
  await f.manager.updateRuntime(f.scope, f.id, input, client);
  f.time.now += 60000; await f.tick(); assert.equal(f.runs.length, 2);
});
void test('active, stopping, unknown and archived plans cannot rebind or bypass old Work fencing', async t => {
  const f = await fixture(t), p = await f.preview();
  for (const change of [{ state: 'enabled' }, { state: 'stopping' }, { state: 'archived' }, { active: { jobId: randomUUID() } }, { history: [{ state: 'unknown' }] }]) {
    const job = structuredClone(f.before); Object.assign(job.noahOperation, change);
    f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job), f.id);
    await assert.rejects(f.preview(), { status: 409 });
    await assert.rejects(f.service.command(f.user, { ...intent(p), id: f.id, action: 'rebind', binding: p.runtime.candidate }), { status: 409 });
  }
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(f.before), f.id);
  await f.update(intent(p)); await f.manager.resume(f.scope, f.id, f.client); f.time.now += 60000;
  const parent = await f.service.get(f.user, f.id);
  // Claim using service test data from the persisted lease is deliberately not possible;
  // the host owns that secret. A crafted old-version Work must still fail validation.
  const run = await createNoahWork(operationRunId(f.id, 2), { ...parent.noahOperation.binding, prompt: parent.noahOperation.config.prompt, inputSha256: await executionInputDigest(parent.noahOperation.config.agentId, parent.noahOperation.config.prompt), claimSha256: 'a'.repeat(64), operation: { id: f.id, sequence: 2, bindingVersion: 1 } });
  await assert.rejects(validateOperationRun(f.store, f.user, run), { status: 409 });
});
void test('server revalidates source permission and rejects unpinned, retargeted or malformed bindings', async t => {
  let allowed = false, checks = 0;
  const f = await fixture(t, { validateBinding: async () => { checks++; if (!allowed) throw new NoahExecutionError('revoked', 403); } }), p = await f.preview(), input = intent(p);
  await assert.rejects(f.update(input), { status: 403 }); assert.equal(checks, 1);
  allowed = true;
  for (const change of [{ modelSha256: undefined }, { modelSha256: 'a'.repeat(64) }, { agentId: 'other' }, { command: 'open Safari' }]) {
    const binding = { ...p.runtime.candidate, image: 'sha256:' + 'c'.repeat(64), ...change };
    await assert.rejects(f.service.command(f.user, { ...input, candidateDigest: digest(binding), id: f.id, action: 'rebind', binding }), { status: 400 });
  }
  for (const change of [{ confirmation: undefined }, { commandId: 'bad' }, { revision: -1 }, { binding: p.runtime.candidate }]) await assert.rejects(f.update({ ...input, ...change }), { status: 400 });
  f.revoke(); await assert.rejects(f.update(input), { status: 403 });
});
void test('runtime version cap and no-change updates preserve stopped state and counters', async t => {
  const f = await fixture(t), p = await f.preview();
  const job = structuredClone(f.before); job.noahOperation.bindingVersion = 20;
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job), f.id);
  await assert.rejects(f.update(intent(p)), { status: 429 });
  delete job.noahOperation.bindingVersion; job.noahOperation.binding = p.runtime.candidate;
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job), f.id);
  assert.equal((await f.preview()).runtime.changed, false);
  await assert.rejects(f.update(intent(await f.preview())), { status: 409 });
});
void test('runtime bridge validates local host, origin and account before preview or mutation', async () => {
  const scope = `owner-v1:${'a'.repeat(64)}`, id = randomUUID(); let reads = 0, writes = 0;
  const manager = { async runtimePreview() { reads++; return { runtime: {} }; }, async updateRuntime(_s, _id, body) { writes++; assert.equal(body.confirmation, 'noah-operation-runtime/1'); return {}; } };
  const middleware = generalOperationsMiddleware({ manager, port: 3107, getOwner: async () => ({ localHostOwner: true, ownerScope: scope }), workFor() {}, operationFor() {} });
  async function request(method, headers = {}) {
    const body = { confirmation: 'noah-operation-runtime/1' }, req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { socket: {remoteAddress:'127.0.0.1'}, url: `/__noah/operations/${id}/runtime`, method, headers: {host:'127.0.0.1:3107',origin:'http://127.0.0.1:3107','content-type':'application/json','x-rock-owner-scope':scope,...headers} });
    let status; await middleware(req, {writeHead(s) {status=s;},end(){}}, () => {}); return status;
  }
  assert.equal(await request('GET', {'sec-fetch-site':'cross-site'}),403);
  assert.equal(await request('POST', {origin:'https://other.invalid'}),403);
  assert.equal(await request('POST', {'x-rock-owner-scope':'other'}),409);
  assert.equal(reads + writes, 0);
  assert.equal(await request('GET'),200); assert.equal(await request('POST'),200);
  assert.equal(reads,1); assert.equal(writes,1);
});
