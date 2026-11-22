import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { codeSnapshot, checkCodeTypes } from '../scripts/noah-code-validation.mjs';
import { createSaveRefactorManager, saveRefactorMiddleware } from '../scripts/noah-save-refactor.mjs';
const { createCoordinator } = createRequire(import.meta.url)('../toolkits/noah-vscode/coordinator.cjs');
const snapshot = () => ({ target: 'sum.ts', test: 'sum.test.mjs', files: [{ name: 'sum.ts', content: 'export const sum = (a: number, b: number) => a + b;' }, { name: 'sum.test.mjs', content: "import {sum} from './sum.ts';" }] });
await test('validator accepts supplied modules and rejects type errors, traversal, hidden or extra inputs', () => {
  assert.deepEqual(checkCodeTypes(codeSnapshot(snapshot())), []);
  const bad = snapshot(); bad.files[0].content = 'export const value: number = "wrong";'; assert.ok(checkCodeTypes(bad).length);
  for (const name of ['../secret.ts', '.env.ts', '/etc/x.ts', 'src/.secret.ts', 'x.json', 'src/../../x.ts']) {
    const x = snapshot(); x.target = x.files[0].name = name; assert.throws(() => codeSnapshot(x));
  }
  const external = snapshot(); external.files[0].content = "import x from '/etc/private'; export {x};"; assert.ok(checkCodeTypes(external).length);
});
await test('save operation is disabled initially, owner isolated, resets on configuration change and revokes during validation', async () => {
  let release, signal;
  const installations = { execution: async () => ({ execution: { image: 'test' } }) };
  const manager = createSaveRefactorManager({ root: '/test', installations, executions: { stop: async () => {} }, validate: options => { signal = options.signal; return new Promise(resolve => { release = resolve; }); } });
  const info = { id: randomUUID(), label: 'test', target: 'sum.ts', test: 'sum.test.mjs' }, owner = 'owner';
  assert.equal(manager.register(owner, info).enabled, false);
  assert.throws(() => manager.status('other', info.id));
  await assert.rejects(manager.check(owner, info.id, { generation: 'wrong', snapshot: snapshot() }));
  const enabled = await manager.control(owner, info.id, true);
  const checking = manager.check(owner, info.id, { generation: enabled.generation, snapshot: snapshot() });
  await new Promise(resolve => setImmediate(resolve));
  await manager.control(owner, info.id, false);
  assert.equal(signal.aborted, true); release({ passed: true }); await assert.rejects(checking, /停止/);
  await manager.control(owner, info.id, true);
  const changed = manager.register(owner, { ...info, label: 'changed' }); assert.equal(changed.enabled, false); assert.notEqual(changed.generation, enabled.generation);
  manager.close();
});
function fixture(overrides = {}) {
  const applied = [], reports = []; const state = { enabled: true, generation: '1' }; let same = true;
  const coordinator = createCoordinator({ policy: async () => state, unchanged: async () => same, validate: async () => ({ passed: true }), run: async () => ({ text: 'improved', workId: 'work' }), apply: async (before, after) => { applied.push([before, after]); return true; }, report: text => reports.push(text), ...overrides });
  return { coordinator, applied, reports, state, edit: () => { same = false; } };
}
await test('save coordinator validates before and after, then applies the same revision once', async () => {
  const events = [];
  const f = fixture({ validate: async (_s, text) => { events.push(text); return { passed: true }; } });
  await f.coordinator.saved({ text: 'original' });
  assert.deepEqual(events, ['original', 'improved']); assert.equal(f.applied.length, 1);
});
await test('baseline or candidate test failure never applies output', async () => {
  for (const stage of ['original', 'improved']) {
    const f = fixture({ validate: async (_s, text) => ({ passed: text !== stage, output: 'failed' }) });
    await f.coordinator.saved({ text: 'original' }); assert.equal(f.applied.length, 0);
  }
});
await test('stop or user edit while agent runs invalidates its successful output', async () => {
  for (const action of ['stop', 'edit', 'invalidate']) {
    let release;
    const f = fixture({ run: () => new Promise(resolve => { release = resolve; }) });
    const running = f.coordinator.saved({ text: 'original' }); await new Promise(resolve => setImmediate(resolve));
    if (action === 'stop') f.state.enabled = false; else if (action === 'edit') f.edit(); else f.coordinator.invalidate();
    release({ text: 'improved' }); await running; assert.equal(f.applied.length, 0);
  }
});
await test('rapid saves coalesce and only the newest save can be applied', async () => {
  let release, count = 0;
  const f = fixture({ run: async s => { count++; if (count === 1) await new Promise(resolve => { release = resolve; }); return { text: s.text + '-fixed' }; } });
  const first = f.coordinator.saved({ text: 'one' }); await new Promise(resolve => setImmediate(resolve));
  await f.coordinator.saved({ text: 'two' }); await f.coordinator.saved({ text: 'three' }); release(); await first;
  assert.equal(count, 2); assert.equal(f.applied.length, 1); assert.equal(f.applied[0][0].text, 'three');
});
await test('expired editor heartbeat blocks work; disconnected checks abort and release the shared validation slot', async () => {
  let now = 0, release;
  const manager = createSaveRefactorManager({ root: '/test', clock: () => now, installations: { execution: async () => ({}) }, executions: {}, validate: ({ signal }) => new Promise((resolve, reject) => { release = () => resolve({ passed: true }); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
  const info = { id: randomUUID(), label: 'one', target: 'sum.ts', test: 'sum.test.mjs' };
  manager.register('owner', info); now = 20000;
  assert.equal(manager.status('owner', info.id).connected, false);
  await assert.rejects(manager.control('owner', info.id, true), e => e.status === 409);
  manager.heartbeat('owner', info.id);
  const state = await manager.control('owner', info.id, true), value = { generation: state.generation, snapshot: snapshot() }, controller = new AbortController();
  const checking = manager.check('owner', info.id, value, controller.signal);
  const aborted = assert.rejects(checking, { name: 'AbortError' });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(manager.check('owner', info.id, value), e => e.status === 429);
  controller.abort(); await aborted;
  const retry = manager.check('owner', info.id, value); await new Promise(resolve => setImmediate(resolve)); release(); assert.equal((await retry).passed, true);
  now += 20000; await assert.rejects(manager.check('owner', info.id, value), e => e.status === 409); manager.close();
});
await test('save API rejects cross-origin, changed owner, invalid JSON and unsupported methods before mutation', async () => {
  const ownerScope = 'owner-v1:' + 'a'.repeat(64); let registrations = 0;
  const middleware = saveRefactorMiddleware({ port: 3107, getOwner: async () => ({ localHostOwner: true, ownerScope }), workFor: () => ({}), manager: { register: () => { registrations++; return {}; } } });
  const invoke = async ({ method = 'POST', headers = {}, body = '{}' } = {}) => {
    const req = Readable.from([Buffer.from(body)]); req.url = '/__noah/save-refactor'; req.method = method; req.headers = { host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107', 'content-type': 'application/json', 'x-rock-owner-scope': ownerScope, ...headers };
    req.socket = { remoteAddress: '127.0.0.1' }; const res = new EventEmitter(); let status;
    res.writeHead = value => { status = value; }; res.end = () => {}; await middleware(req, res, () => assert.fail('unexpected next')); return status;
  };
  assert.equal(await invoke({ headers: { origin: 'https://evil.example' } }), 403);
  assert.equal(await invoke({ headers: { host: 'evil.example' } }), 403);
  assert.equal(await invoke({ headers: { 'x-rock-owner-scope': 'other' } }), 409);
  assert.equal(await invoke({ headers: { 'content-type': 'text/plain' } }), 415);
  assert.equal(await invoke({ body: 'null' }), 400); assert.equal(await invoke({ method: 'DELETE' }), 405);
  assert.equal(registrations, 0); assert.equal(await invoke(), 200); assert.equal(registrations, 1);
});
