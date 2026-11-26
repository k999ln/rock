import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateSharedSample, isSharedSampleId, SHARED_WORKLOAD_SHA256, SHARED_WORKLOAD_VERSION } from '../lib/noah-shared-workload.ts';
import { eligibleLinux, loadModel, makeApi, processLease, runSample } from '../public/noah-shared-compute/runner.mjs';

const model = await loadModel();
const signal = () => new AbortController().signal;
const lease = () => ({ jobId: randomUUID(), leaseId: randomUUID(), workload: SHARED_WORKLOAD_VERSION, artifactSha256: SHARED_WORKLOAD_SHA256, sampleId: model.samples[0].id, expiresAt: Date.now() + 4000 });

void test('published model hash and isolated, bounded WASM results match the independent verifier', async () => {
  const bytes = await readFile(new URL('../public/noah-shared-compute/model.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), SHARED_WORKLOAD_SHA256);
  assert.equal(model.version, SHARED_WORKLOAD_VERSION);
  const wasm = await WebAssembly.compile(Buffer.from(model.dot4Wasm, 'hex'));
  assert.deepEqual(WebAssembly.Module.imports(wasm), []);
  assert.deepEqual(WebAssembly.Module.exports(wasm), [{ name: 'dot4', kind: 'function' }]);
  for (const sample of model.samples) {
    assert.equal(isSharedSampleId(sample.id), true);
    assert.deepEqual(await runSample(model, sample.id, signal()), evaluateSharedSample(sample.id));
  }
  assert.equal(isSharedSampleId({ id: 'meeting-notes' }), false);
  assert.throws(() => runSample(model, '../../etc/passwd', signal()));
});

function sensors(overrides = {}) {
  const values = {
    '/sys/class/power_supply/AC/type': 'Mains',
    '/sys/class/power_supply/AC/online': '1',
    '/sys/class/thermal/thermal_zone0/type': 'x86_pkg_temp',
    '/sys/class/thermal/thermal_zone0/temp': '52000',
    'powerprofilesctl get': 'balanced', 'nmcli -t -e no -f DEVICE,TYPE,STATE device status': 'eth0:ethernet:connected\nlo:loopback:connected (externally)',
    'nmcli -g GENERAL.METERED device show eth0': 'no',
    'ip -j -4 route show default': '[{"dev":"eth0"}]', 'ip -j -6 route show default': '[]',
    ...overrides,
  };
  return {
    platform: 'linux', list: async path => path.endsWith('/thermal') ? ['thermal_zone0'] : ['AC'],
    read: async key => values[key],
    execute: async (file, args) => values[[file.split('/').at(-1), ...args].join(' ')],
  };
}

void test('missing, unsafe, unknown or metered power/thermal/network signals fail closed', async () => {
  assert.equal(await eligibleLinux(sensors()), true);
  for (const bad of [
    { '/sys/class/power_supply/AC/online': '0' }, { 'powerprofilesctl get': 'power-saver' },
    { '/sys/class/thermal/thermal_zone0/temp': '70000' }, { '/sys/class/thermal/thermal_zone0/temp': '' },
    { '/sys/class/thermal/thermal_zone0/type': 'unknown' },
    { 'nmcli -g GENERAL.METERED device show eth0': 'no (guessed)' },
    { 'nmcli -g GENERAL.METERED device show eth0': 'yes' },
    { 'ip -j -6 route show default': '[{"dev":"wwan0"}]' }, { 'ip -j -4 route show default': '[]' },
  ]) assert.equal(await eligibleLinux(sensors(bad)), false, JSON.stringify(bad));
  assert.equal(await eligibleLinux({ ...sensors(), platform: 'darwin' }), false);
});

void test('a leased participant submits one real result with fresh consent only', async () => {
  const calls = [];
  const work = lease();
  const api = async (action, data) => {
    calls.push(action);
    assert.equal(data.jobId, work.jobId);
    assert.equal(data.leaseId, work.leaseId);
    if (action === 'heartbeat') return { expiresAt: Date.now() + 4000 };
    assert.deepEqual(data.result, evaluateSharedSample(work.sampleId));
    assert.ok(data.elapsedMs >= 0 && data.elapsedMs <= 750);
    return { receiptId: randomUUID() };
  };
  assert.equal(await processLease({ lease: work, model, eligible: async () => true, api, signal: signal() }), true);
  assert.deepEqual(calls, ['heartbeat','complete']);
});

void test('revoked, aborted, unknown and expired leases cannot publish a result', async () => {
  const abort = new AbortController();
  const calls = [];
  const api = async action => {
    calls.push(action);
    if (action === 'heartbeat') throw new Error('revoked');
  };
  const opts = { model, eligible: async () => true, signal: abort.signal, api };
  await assert.rejects(processLease({ ...opts, lease: lease() }), /revoked/);
  assert.deepEqual(calls, ['heartbeat','release']);
  calls.length = 0;
  for (const change of [{ workload: 'other' }, { artifactSha256: 'changed' }, { expiresAt: Date.now() }, { sampleId: 'unknown' }]) {
    assert.equal(await processLease({ ...opts, lease: { ...lease(), ...change } }), false);
  }
  assert.deepEqual(calls, []);
  const changes = [true,false];
  assert.equal(await processLease({ ...opts, lease: lease(), eligible: async () => changes.shift(),
    api: async action => { calls.push(action); return { expiresAt: Date.now()+4000 }; } }), false);
  assert.deepEqual(calls, ['heartbeat','release']);
  const running = runSample(model, model.samples[0].id, abort.signal);
  const started = performance.now();
  abort.abort();
  await assert.rejects(running);
  assert.ok(performance.now() - started < 5_000);
});

void test('participant network budget is bounded, credential goes only to the service, oversized responses rejected', async () => {
  const token = randomUUID(), deviceId = randomUUID();
  let networkCalls = 0;
  const api = makeApi({ deviceId, token, maxBytes: 4400, request: async (url, req) => {
    ++networkCalls;
    assert.equal(url, 'https://avoado.si/api/noah/shared-compute');
    assert.equal(req.redirect, 'error');
    assert.deepEqual(JSON.parse(req.body), { deviceId, deviceToken: token, action: 'claim' });
    return Response.json({ lease: null });
  } });
  await api('claim', {}, signal()); await api('claim', {}, signal());
  await assert.rejects(api('claim', {}, signal()), /通信枠/);
  assert.equal(networkCalls, 2);
  const large = makeApi({ deviceId, token, maxBytes: 8192, request: async () => new Response('x'.repeat(4097)) });
  await assert.rejects(large('claim', {}, signal()), /大きすぎ/);
});
