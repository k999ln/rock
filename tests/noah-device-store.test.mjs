import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createLinuxLocalManager } from '../scripts/sky-linux-local-runtime.mjs';

async function fixture(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'noah-store-'));
  const calls = { prepare: [], run: [] };
  const environment = { id: 'pixel-linux', bootId: 'noah-test-boot',
    async assertExecutionAllowed() { if (options.denied) throw new Error('OWNER_DENIED'); },
    async prepare(lock, _worker, { signal }) {
      calls.prepare.push(lock.model.id);
      if (options.wait) await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
      if (options.fail) throw new Error('DOWNLOAD_FAILED');
      return { ready: true, platform: 'linux', architecture: 'aarch64', bootId: 'noah-test-boot', modelSha256: options.wrongHash ? 'f'.repeat(64) : lock.model.sha256 };
    },
    async stop() {},
    spawn(args, { input } = {}) {
      if (args.includes('-c')) return { promise: Promise.resolve('/home/fixture') };
      if (args.includes('stop')) return { promise: Promise.resolve('{"confirmed":true}') };
      const request = JSON.parse(input); calls.run.push(request);
      return { promise: Promise.resolve(JSON.stringify({ text: '合成環境の成果です。', durationMs: 10, platform: 'linux', architecture: 'aarch64', modelSha256: request.modelSha256 })) };
    },
  };
  let manager = await createLinuxLocalManager({ stateDir: dir, environment });
  return { calls, options, dir, get manager() { return manager; }, async restart() { await manager.close(); manager = await createLinuxLocalManager({ stateDir: dir, environment }); }, async close() { await manager.close(); await rm(dir, { recursive: true, force: true }); } };
}
function addInput(manager, kind = 'agent') {
  const { device, catalog } = manager.snapshot().noah, item = catalog.find(row => row.kind === kind);
  return { action: 'noah-add', deviceId: device.id, catalogId: item.id, catalogDigest: item.digest, requestId: randomUUID(), accepted: true };
}
async function settled(manager) {
  for (let n = 0; n < 100 && (manager.snapshot().phase === 'preparing' || manager.snapshot().runs.some(r => r.job.status === 'active')); n++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.notEqual(manager.snapshot().phase, 'preparing');
}
void test('Noah Agent and LLM both add dependencies, prepare, hand off to Eve, save and restore one Job', async t => {
  for (const kind of ['agent', 'model']) await t.test(kind, async () => {
    const f = await fixture();
    try {
      const request = addInput(f.manager, kind);
      await f.manager.action(request); await settled(f.manager);
      const state = f.manager.snapshot(), receipt = state.noah.installs[0];
      assert.equal(state.phase, 'ready'); assert.equal(state.models.length, 1); assert.equal(state.agents.length, 1);
      const run = { action: 'run', deviceId: state.noah.device.id, surface: 'eve', agentId: receipt.agentId, agentSha256: receipt.agentSha256, modelSha256: receipt.modelSha256, input: 'この文章を短くしてください', accepted: true, requestId: randomUUID() };
      await f.manager.action(run); await settled(f.manager); await f.manager.action(run);
      assert.equal(f.calls.run.length, 1); assert.equal(f.manager.snapshot().runs[0].job.status, 'review');
      assert.equal(f.calls.run[0].modelSha256, receipt.modelSha256);
      await f.manager.action({ action: 'confirm', jobId: run.requestId });
      assert.match((await f.manager.action({ action: 'export', jobId: run.requestId })).text, /合成環境の成果/);
      await f.restart();
      await f.manager.action(request); await f.manager.action(run);
      assert.equal(f.manager.snapshot().noah.device.id, state.noah.device.id);
      assert.equal(f.manager.snapshot().runs[0].job.status, 'completed');
      assert.equal(f.calls.prepare.length, 1); assert.equal(f.calls.run.length, 1);
    } finally { await f.close(); }
  });
});
void test('wrong device, changed catalog, missing consent and undeclared code never prepare or register', async () => {
  const f = await fixture();
  try {
    const input = addInput(f.manager);
    for (const patch of [{ deviceId: randomUUID() }, { catalogDigest: 'f'.repeat(64) }, { accepted: false }, { command: 'sh' }, { requestId: '../invalid' }]) await assert.rejects(f.manager.action({ ...input, ...patch }));
    const { deviceId: _device, ...withoutDevice } = input; await assert.rejects(f.manager.action(withoutDevice));
    assert.equal(f.calls.prepare.length, 0); assert.equal(f.manager.snapshot().agents.length, 0);
    f.options.denied = true; await assert.rejects(f.manager.action(input), /OWNER_DENIED/);
  } finally { await f.close(); }
});
void test('response loss, duplicate taps, conflict and restart do not create another Agent or download', async () => {
  const f = await fixture();
  try {
    const request = addInput(f.manager);
    await Promise.allSettled([f.manager.action(request), f.manager.action(request)]); await settled(f.manager);
    await f.manager.action(request);
    await assert.rejects(f.manager.action({ ...request, catalogId: 'different' }), /異なり/);
    await f.restart(); await f.manager.action(request);
    assert.equal(f.calls.prepare.length, 1); assert.equal(f.manager.snapshot().agents.length, 1);
    assert.equal(f.manager.snapshot().noah.installs.length, 1);
    const saved = JSON.parse(await readFile(join(f.dir, 'state.json'), 'utf8'));
    assert.equal(saved.noahInstalls[0].requestId, request.requestId);
  } finally { await f.close(); }
});
void test('download failure and checksum mismatch stay unready; retry uses existing identities', async () => {
  for (const option of ['fail', 'wrongHash']) {
    const f = await fixture({ [option]: true });
    try {
      const request = addInput(f.manager); await f.manager.action(request); await settled(f.manager);
      const state = f.manager.snapshot(), receipt = state.noah.installs[0];
      assert.equal(state.phase, 'failed'); assert.deepEqual(state.preparedModels, []);
      await f.manager.action(request); assert.equal(f.calls.prepare.length, 1);
      await assert.rejects(f.manager.action({ action: 'run', agentId: receipt.agentId, requestId: randomUUID(), accepted: true, input: 'test' }));
      f.options[option] = false;
      await f.manager.action({ action: 'prepare', deviceId: state.noah.device.id, modelId: receipt.modelId, modelSha256: receipt.modelSha256, accepted: true }); await settled(f.manager);
      assert.equal(f.manager.snapshot().phase, 'ready'); assert.equal(f.manager.snapshot().agents[0].id, receipt.agentId);
    } finally { await f.close(); }
  }
});
void test('cancelled preparation stays stopped across replay and restart; stale Eve pin is rejected', async () => {
  const f = await fixture({ wait: true });
  try {
    const request = addInput(f.manager); await f.manager.action(request);
    await f.manager.action({ action: 'stop-environment', deviceId: request.deviceId });
    await f.restart(); await f.manager.action(request);
    assert.equal(f.manager.snapshot().phase, 'stopped'); assert.equal(f.calls.prepare.length, 1);
    const r = f.manager.snapshot().noah.installs[0];
    await assert.rejects(f.manager.action({ action: 'run', surface: 'eve', agentId: r.agentId, agentSha256: 'changed', modelSha256: r.modelSha256, requestId: randomUUID(), accepted: true, input: 'test' }), /変わり/);
    assert.equal(f.calls.run.length, 0);
  } finally { await f.close(); }
});
void test('Agent and LLM entries share one prepared model without replacing the first Agent', async () => {
  const f = await fixture();
  try {
    await f.manager.action(addInput(f.manager)); await settled(f.manager);
    const first = f.manager.snapshot().agents[0];
    await f.manager.action(addInput(f.manager, 'model')); await settled(f.manager);
    assert.equal(f.calls.prepare.length, 1); assert.equal(f.manager.snapshot().models.length, 1);
    assert.equal(f.manager.snapshot().agents.length, 2); assert.deepEqual(f.manager.snapshot().agents[0], first);
  } finally { await f.close(); }
});
void test('failed registration save rolls back the library and never starts a download', async () => {
  const f = await fixture(); let moved = false;
  try {
    const input = addInput(f.manager);
    await rename(f.dir, f.dir + '-offline'); moved = true;
    await assert.rejects(f.manager.action(input), { code: 'ENOENT' });
    assert.equal(f.calls.prepare.length, 0); assert.equal(f.manager.snapshot().agents.length, 0); assert.equal(f.manager.snapshot().noah.installs.length, 0);
    await rename(f.dir + '-offline', f.dir); moved = false;
    await f.manager.action(input); await settled(f.manager);
    assert.equal(f.calls.prepare.length, 1); assert.equal(f.manager.snapshot().agents.length, 1);
  } finally { if (moved) await rename(f.dir + '-offline', f.dir); await f.close(); }
});
