import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSmisModuleSession, decodeMicrobitMotion, smisModuleRequestSuffix } from '../lib/smis-module-session.ts';
import { guardSmisModuleWorkPort } from '../lib/smis-module-work-port.ts';
import { connectSmisMicrobit, MICROBIT_MOTION_SERVICE, MICROBIT_MOTION_DATA } from '../lib/smis-microbit-bluetooth.ts';
import { createEveInteractionSession } from '../lib/rockstar-eve-interaction.ts';
import { runtimeEveTextExport } from '../lib/eve-runtime-export.ts';
import { purposeFixture } from './helpers/eve-purpose-fixture.mjs';

function moduleFixture() {
  let now = 100000, serial = 0;
  const sensor = createSmisModuleSession({ owner: 'alice', now: () => now, nonce: () => 'scope-' + ++serial });
  const zero = { x: 0, y: 0, z: 1024 };
  sensor.connect('simulated-module'); sensor.observe(zero);
  function attach(name) { sensor.attach(name); sensor.observe({ x: 1024, y: 0, z: 0 }); sensor.confirmMovement(); return sensor.snapshot(); }
  return { module: sensor, zero, attach, advance: value => { now += value; } };
}
void test('microbit byte decoder respects little endian and DataView offsets, rejects malformed packets', () => {
  const bytes = new Uint8Array(10), view = new DataView(bytes.buffer, 2, 6);
  view.setInt16(0, -1024, true); view.setInt16(2, 32767, true); view.setInt16(4, -32768, true);
  assert.deepEqual(decodeMicrobitMotion(view), { x: -1024, y: 32767, z: -32768 });
  for (const value of [new DataView(new ArrayBuffer(5)), new DataView(new ArrayBuffer(7)), bytes, null]) assert.throws(() => decodeMicrobitMotion(value));
});
void test('one simulated module requires owner attachment and observed motion change for each new object', () => {
  const f = moduleFixture(); assert.throws(() => f.module.snapshot());
  f.module.attach('ペン'); assert.throws(() => f.module.confirmMovement());
  f.module.observe({ x: 1024, y: 0, z: 0 }); f.module.confirmMovement();
  const pen = f.module.snapshot(); assert.equal(pen.automaticDetachDetection, false);
  f.module.detach(); assert.equal(f.module.current(pen), false); f.module.observe(f.zero);
  const plate = f.attach('お皿'); assert.notEqual(pen.objectId, plate.objectId);
  assert.equal(pen.moduleId, plate.moduleId); assert.ok(plate.mountEpoch > pen.mountEpoch);
  assert.equal(f.module.current(pen), false); assert.equal(f.module.current(plate), true);
  assert.match(smisModuleRequestSuffix(plate), /重さ・温度/);
});
void test('freshness, disconnect, reconnect and another owner never revive an earlier attachment', () => {
  const f = moduleFixture(), first = f.attach('容器'); f.advance(10000);
  assert.equal(f.module.current(first), false); assert.throws(() => f.module.snapshot());
  f.module.disconnect(); f.module.connect('simulated-module'); f.module.observe(f.zero);
  assert.equal(f.module.current(first), false);
  const next = f.attach('容器'); assert.notEqual(next.scope, first.scope);
  assert.equal(f.module.current({ ...next, owner: 'bob' }), false);
  assert.throws(() => f.module.attach('\n物')); assert.throws(() => f.module.observe({ x: NaN, y: 0, z: 0 }));
});
void test('clock rollback and raw out-of-range telemetry are rejected', () => {
  const f = moduleFixture(), snap = f.attach('物'); f.advance(-1);
  assert.equal(f.module.current(snap), false); assert.throws(() => f.module.observe(f.zero));
  for (const x of [Infinity, -32769, 32768, 0.1]) assert.throws(() => f.module.observe({ x, y: 0, z: 0 }));
});
void test('work guard blocks changed attachment before dispatch, but retains read and stop access', async () => {
  let scope = { key: 'one', suffix: '\n観測', valid: () => true }, starts = 0, stops = 0;
  const work = guardSmisModuleWorkPort({ prepare: async input => ({ agentId: 'a', agentSha256: 'ab'.repeat(32), modelSha256: 'cd'.repeat(32), input }), start: async () => { starts++; return null; }, read: async () => ({ status: 'running', text: null }), stop: async () => { stops++; return { status: 'stopped', text: null }; } }, () => scope);
  await assert.rejects(work.prepare('suffix missing', () => true));
  const prepared = await work.prepare('依頼\n観測', () => true), ref = { id: crypto.randomUUID(), ...prepared };
  scope = null; await assert.rejects(work.start(ref)); assert.equal(starts, 0);
  assert.equal((await work.read(ref)).status, 'running'); assert.equal((await work.stop(ref)).status, 'stopped'); assert.equal(stops, 1);
});
void test('work guard cancels preparation when its input binding changes during an asynchronous response', async () => {
  let live = true, release;
  const wait = new Promise(resolve => { release = resolve; });
  const work = guardSmisModuleWorkPort({ prepare: async (input, continuing) => { await wait; assert.equal(continuing(), false); return { agentId: 'a', agentSha256: 'ab'.repeat(32), modelSha256: 'cd'.repeat(32), input }; }, start: async () => assert.fail('must not start'), read: async () => null, stop: async () => null }, () => ({ key: 'one', suffix: '', valid: () => live }));
  const pending = work.prepare('依頼', () => true); live = false; release(); assert.equal(await pending, null);
});
function bluetoothFixture({ late = false } = {}) {
  const characteristic = new EventTarget(), device = new EventTarget();
  let selection, subscribed = 0, disconnected = 0, release;
  characteristic.startNotifications = async () => { subscribed++; }; characteristic.stopNotifications = async () => {};
  const service = { getCharacteristic: async id => { assert.equal(id, MICROBIT_MOTION_DATA); return characteristic; } };
  const server = { getPrimaryService: async id => { assert.equal(id, MICROBIT_MOTION_SERVICE); return service; } };
  device.id = 'synthetic-ble-device'; device.gatt = { connected: true, disconnect() { disconnected++; }, connect: () => late ? new Promise(resolve => { release = () => resolve(server); }) : Promise.resolve(server) };
  return { device, characteristic, bluetooth: { requestDevice: async options => { selection = options; return device; } }, release: () => release(), counts: () => ({ selection, subscribed, disconnected }) };
}
void test('simulated BLE adapter only subscribes to the fixed motion service and ignores events after stop', async () => {
  const f = bluetoothFixture(), signal = new AbortController(), values = []; let lost = 0;
  const handle = await connectSmisMicrobit(f.bluetooth, { signal: signal.signal, connected: id => assert.equal(id, f.device.id), motion: value => values.push(value), disconnected: () => { lost++; } });
  assert.deepEqual(f.counts().selection.optionalServices, [MICROBIT_MOTION_SERVICE]);
  f.characteristic.value = new DataView(new ArrayBuffer(6)); f.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.equal(values.length, 1); handle.stop(); handle.stop();
  f.characteristic.dispatchEvent(new Event('characteristicvaluechanged')); assert.equal(values.length, 1); assert.equal(lost, 1); assert.equal(f.counts().disconnected, 1);
});
void test('malformed Bluetooth frame retires the connection rather than keeping previous readings live', async () => {
  const f = bluetoothFixture(); let lost = 0;
  await connectSmisMicrobit(f.bluetooth, { signal: new AbortController().signal, connected: () => {}, motion: () => assert.fail('invalid packet'), disconnected: () => { lost++; } });
  f.characteristic.value = new DataView(new ArrayBuffer(8)); f.characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.equal(lost, 1); assert.equal(f.counts().disconnected, 1);
});
void test('aborted late GATT setup is closed without subscribing or creating a job', async () => {
  const f = bluetoothFixture({ late: true }), abort = new AbortController();
  const pending = connectSmisMicrobit(f.bluetooth, { signal: abort.signal, connected: () => assert.fail('retired setup'), motion: () => {}, disconnected: () => {} });
  await new Promise(resolve => setImmediate(resolve)); abort.abort(); await assert.rejects(pending); f.release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.counts().subscribed, 0); assert.ok(f.counts().disconnected >= 1);
});
void test('simulated module + real common purpose/runtime/SQLite path creates, executes, exports, stops and rebinds', async t => {
  const f = await purposeFixture(t), m = moduleFixture(), results = [];
  for (const name of ['ペン', 'お皿']) {
    m.module.observe(m.zero); const snapshot = m.attach(name), suffix = smisModuleRequestSuffix(snapshot);
    const inputContext = { key: snapshot.scope, suffix, valid: () => m.module.current(snapshot) };
    const work = guardSmisModuleWorkPort(f.port(), () => inputContext);
    const session = createEveInteractionSession({ work, pendingKey: f.pendingKey, storage: f.storage, changed: () => {} });
    session.arm(); session.hearFinal('Hey Eve'); session.hearFinal('観測した値から短い記録を作る' + suffix);
    await session.confirm(); assert.equal(session.state.phase, 'running');
    const id = session.state.jobId, entry = (await f.store().commands(f.device)).find(e => e.command.request.id === id);
    assert.ok(entry); assert.match(entry.command.request.input, new RegExp(name));
    const report = await f.report(entry); await f.store().publish(f.device, { report, revision: 0 });
    await session.refresh(); assert.equal(session.state.phase, 'result');
    const execution = (await f.store().inspectOwnerRequest(id)).execution, output = await runtimeEveTextExport(execution, execution);
    assert.ok(Buffer.from(output.text, 'utf8').toString('utf8').includes(report.text));
    assert.ok(output.name.endsWith('.txt')); await session.stop(); assert.equal(session.state.phase, 'standby');
    results.push({ id, output }); m.module.detach(); assert.equal(m.module.current(snapshot), false);
  }
  assert.notEqual(results[0].id, results[1].id); assert.equal(f.counts.libraryWrites, 2); assert.equal(f.counts.runtimeStarts, 2);
  for (const r of results) assert.equal((await f.store().inspectOwnerRequest(r.id)).execution.report.text, '合成の保存結果');
});
void test('private page and permission exception are opt-in development only; no public Bluetooth policy changes', () => {
  const config = readFileSync(new URL('../next.config.ts', import.meta.url), 'utf8');
  assert.match(config, /SMIS_MODULE_PRIVATE_PREVIEW === '1' && process.env.NODE_ENV === 'development'/);
  assert.match(config, /source: '\/os\/eve\/module'/);
  const policy = JSON.parse(readFileSync(new URL('../data/web-security-policy.json', import.meta.url), 'utf8'));
  assert.match(policy.universalHeaders['Permissions-Policy'], /bluetooth=\(\)/);
  const page = readFileSync(new URL('../app/os/eve/module/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /notFound\(\)/); assert.match(page, /NODE_ENV !== 'development'/);
});
void test('lost module after reload still permits recovery and stop of the original pending common job', async t => {
  const f = await purposeFixture(t), m = moduleFixture(), snap = m.attach('試験対象');
  const suffix = smisModuleRequestSuffix(snap); let context = { key: snap.scope, suffix, valid: () => m.module.current(snap) };
  const session = createEveInteractionSession({ work: guardSmisModuleWorkPort(f.port(), () => context), pendingKey: f.pendingKey, storage: f.storage, changed: () => {} });
  session.arm(); session.hearFinal('Hey Eve'); session.hearFinal('この値を記録する' + suffix); await session.confirm();
  const id = session.state.jobId; assert.equal(session.state.phase, 'running'); m.module.disconnect(); context = null;
  const resumed = createEveInteractionSession({ work: guardSmisModuleWorkPort(f.port(), () => context), pendingKey: f.pendingKey, storage: f.storage, changed: () => {} });
  resumed.arm(); assert.equal(resumed.state.phase, 'unknown'); assert.equal(resumed.state.jobId, id);
  await resumed.stop(); assert.equal(resumed.state.phase, 'standby'); assert.equal(f.counts.runtimeStarts, 1);
  assert.equal((await f.store().inspectOwnerRequest(id)).pending.state, 'cancelled-before-start');
});

void test('local production evidence permits a free loopback port but never remote URLs or credentials', async () => {
  const { isLocalWebSecurityEvidenceOrigin } = await import('../scripts/release-readiness-lib.mjs');
  for (const value of ['http://127.0.0.1:8787', 'http://127.0.0.1:8788']) assert.equal(isLocalWebSecurityEvidenceOrigin(value), true);
  for (const value of [null, 'http://127.0.0.1', 'http://127.0.0.1:8788/', 'http://localhost:8788', 'https://example.com:8788', 'http://127.0.0.1.evil:8788', 'http://user:password@127.0.0.1:8788', 'http://127.0.0.1:8788?pass=1', 'http://127.0.0.1:8788#pass', 'http://127.0.0.1:99999']) assert.equal(isLocalWebSecurityEvidenceOrigin(value), false);
});

void test('invalid telemetry retires a previously confirmed core attachment for future adapters too', () => {
  const f = moduleFixture(), snap = f.attach('物');
  assert.throws(() => f.module.observe({ x: 40000, y: 0, z: 0 }));
  assert.equal(f.module.current(snap), false); assert.equal(f.module.view.connected, false);
  assert.throws(() => f.module.observe(f.zero));
});
