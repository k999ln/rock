import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createLinuxLocalManager } from '../scripts/sky-linux-local-runtime.mjs';
import { beginLinuxRun, finishLinuxRun } from '../lib/sky-linux-local.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const model = JSON.parse(await readFile(new URL('../toolkits/sky-linux-local/runtime-lock.json', import.meta.url))).model;
const digest = value => createHash('sha256').update(value).digest('hex');
const input = '  保存済みの同じ依頼\n';

async function fixture(t, runs = []) {
  const dir = await mkdtemp(join(tmpdir(), 'sky-input-binding-'));
  const managers = [];
  t.after(async () => {
    try { for (const manager of managers.reverse()) await manager.close(); }
    finally { await rm(dir, { recursive: true, force: true }); }
  });
  const agent = { id: randomUUID(), name: 'fixture担当', instructions: '合成試験のみ', modelId: model.id, sha256: 'b'.repeat(64) };
  const request = { action: 'run', accepted: true, agentId: agent.id, input, requestId: randomUUID() };
  const state = { schema: 1, owner: 'local-uid:' + userInfo().uid, phase: 'ready', models: [model], agents: [agent], runs,
    preparedModels: [model.id], selectedModelId: model.id, environment: { bootId: 'fixture-boot', modelSha256: model.sha256 }, error: null };
  await writeFile(join(dir, 'state.json'), JSON.stringify(state));
  return { dir, agent, request, state, managers };
}

function adapter({ confirmed = true, revoked = false } = {}) {
  const calls = { syntheticRun: 0, stop: 0 };
  return { calls, environment: { id: 'pixel-linux', bootId: 'fixture-boot',
    assertExecutionAllowed: async () => { if (revoked) throw new Error('FIXTURE_EXECUTION_REVOKED'); },
    spawn(args) {
      if (args.includes('-c')) return { promise: Promise.resolve('/fixture-only') };
      if (args.at(-2) === 'stop') { calls.stop++; return { promise: Promise.resolve(JSON.stringify({ confirmed })) }; }
      if (args.at(-1) === 'run') { calls.syntheticRun++; throw new Error('UNEXPECTED_WORKER_DISPATCH'); }
      throw new Error('unexpected adapter command');
    },
  } };
}

// Kill a host manager at the exact first worker-dispatch boundary. The adapter
// blocks before returning; it never launches Python, a worker, or any model.
const childSource = String.raw`
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [root, dir, requestJson] = process.argv.slice(1);
const { createLinuxLocalManager } = await import(pathToFileURL(join(root, 'scripts/sky-linux-local-runtime.mjs')));
const environment = { id: 'pixel-linux', bootId: 'fixture-boot', spawn(args) {
  if (args.includes('-c')) return { promise: Promise.resolve('/fixture-only') };
  if (args.at(-1) !== 'run') throw new Error('unexpected command before crash boundary');
  const saved = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8'));
  const row = saved.runs.find(r => r.job.id === JSON.parse(requestJson).requestId);
  process.send({ kind: 'first-worker-boundary', inputSha256: row.inputSha256 ?? null });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
  throw new Error('parent failed to terminate fixture manager');
} };
const manager = await createLinuxLocalManager({ root, stateDir: dir, environment });
await manager.action(JSON.parse(requestJson));
throw new Error('crash boundary was not reached');
`;

async function crashAtFirstDispatch(f) {
  const child = spawn(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', childSource,
    root, f.dir, JSON.stringify(f.request)], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const closed = once(child, 'close');
  let timer;
  try {
    const boundary = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('fixture boundary timeout: ' + stderr)), 5000);
      child.once('error', reject);
      child.once('exit', () => reject(new Error('fixture exited before boundary: ' + stderr)));
      child.once('message', resolve);
    });
    assert.equal(boundary.kind, 'first-worker-boundary');
    child.kill('SIGKILL');
    const [code, signal] = await closed;
    assert.equal(code, null); assert.equal(signal, 'SIGKILL');
    return boundary;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

async function reopen(t, f, options) {
  const a = adapter(options);
  const manager = await createLinuxLocalManager({ root, stateDir: f.dir, environment: a.environment });
  f.managers.push(manager);
  return { manager, calls: a.calls };
}

void test('first durable run binds the original input before worker dispatch', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  const boundary = await crashAtFirstDispatch(f);
  const saved = JSON.parse(await readFile(join(f.dir, 'state.json'), 'utf8'));
  assert.equal(boundary.inputSha256, digest(input));
  assert.equal(saved.runs[0].inputSha256, digest(input));
  assert.notEqual(digest(input), digest(input.trim()), 'binding retains the original request bytes');
});

void test('same-ID replay after first-dispatch process death reconciles without resubmission', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  await crashAtFirstDispatch(f);
  const { manager, calls } = await reopen(t, f);
  const before = structuredClone(manager.snapshot().runs[0]);
  assert.equal(before.job.status, 'cancelled'); assert.equal(before.stop, 'confirmed');
  await manager.action(f.request);
  assert.deepEqual(manager.snapshot().runs[0], before);
  assert.equal(manager.snapshot().runs.length, 1);
  assert.equal(calls.stop, 1); assert.equal(calls.syntheticRun, 0);
});

void test('changed input under the same ID remains rejected after process death', { timeout: 10000 }, async t => {
  const f = await fixture(t);
  await crashAtFirstDispatch(f);
  const { manager, calls } = await reopen(t, f);
  await assert.rejects(manager.action({ ...f.request, input: input.trim() }), /内容が異なり/);
  assert.equal(calls.syntheticRun, 0); assert.equal(manager.snapshot().runs.length, 1);
});

void test('legacy rows without input digest are preserved and are never guessed into replay', async t => {
  const f = await fixture(t);
  const row = beginLinuxRun(f.agent, input, f.request.requestId, model.sha256);
  f.state.runs = [row]; await writeFile(join(f.dir, 'state.json'), JSON.stringify(f.state));
  const { manager, calls } = await reopen(t, f);
  await assert.rejects(manager.action(f.request), /内容が異なり/);
  const saved = JSON.parse(await readFile(join(f.dir, 'state.json'), 'utf8'));
  assert.equal(Object.hasOwn(saved.runs[0], 'inputSha256'), false);
  assert.equal(saved.runs[0].input, row.input);
  assert.equal(calls.syntheticRun, 0); assert.equal(calls.stop, 1);
});

void test('revoked execution is rejected before adding a new durable run', async t => {
  const f = await fixture(t);
  const { manager, calls } = await reopen(t, f, { revoked: true });
  await assert.rejects(manager.action(f.request), /FIXTURE_EXECUTION_REVOKED/);
  const saved = JSON.parse(await readFile(join(f.dir, 'state.json'), 'utf8'));
  assert.equal(saved.runs.length, 0); assert.equal(calls.syntheticRun, 0);
});

void test('unconfirmed recovery stop still blocks a new request', async t => {
  const f = await fixture(t);
  f.state.runs = [{ ...beginLinuxRun(f.agent, input, f.request.requestId, model.sha256), inputSha256: digest(input) }];
  await writeFile(join(f.dir, 'state.json'), JSON.stringify(f.state));
  const { manager, calls } = await reopen(t, f, { confirmed: false });
  await assert.rejects(manager.action({ ...f.request, requestId: randomUUID() }), /停止が未確認/);
  assert.equal(manager.snapshot().runs[0].stop, 'unconfirmed');
  assert.equal(calls.syntheticRun, 0); assert.equal(calls.stop, 1);
});

void test('pre-existing output, agent/model and export bytes survive reopen unchanged', async t => {
  const f = await fixture(t);
  const prior = finishLinuxRun(beginLinuxRun(f.agent, '既存合成依頼', randomUUID(), model.sha256),
    { text: '保存済みの合成成果\n原文', modelSha256: model.sha256, durationMs: 12 });
  prior.inputSha256 = digest('既存合成依頼'); f.state.runs = [prior];
  await writeFile(join(f.dir, 'state.json'), JSON.stringify(f.state));
  const a = await reopen(t, f);
  const before = await a.manager.action({ action: 'export', jobId: prior.job.id });
  await a.manager.close();
  const b = await reopen(t, f);
  const after = await b.manager.action({ action: 'export', jobId: prior.job.id });
  assert.deepEqual(after, before);
  const saved = JSON.parse(await readFile(join(f.dir, 'state.json'), 'utf8'));
  assert.deepEqual(saved.runs[0], prior);
  assert.deepEqual(b.manager.snapshot().agents, f.state.agents);
  assert.equal(b.manager.snapshot().models[0].sha256, model.sha256);
  assert.equal(a.calls.syntheticRun + b.calls.syntheticRun, 0);
  assert.equal(a.calls.stop + b.calls.stop, 0);
});
