import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { NOAH_CLOUD_PROFILES, NOAH_EVE_ADVICE_PURPOSE, NOAH_EVE_HERMES_PROJECT, noahCloudModelInput, noahCloudResult, noahCloudProfile } from '../lib/noah-cloud-contract.ts';

const bundle = await build({ entryPoints: ['services/noah-cloud-agents/worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'node', plugins: [{ name: 'durable-object-test-host', setup(b) {
  b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'durable', namespace: 'test' }));
  b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export class DurableObject { constructor(ctx,env){this.ctx=ctx;this.env=env} }', loader: 'js' }));
} }] });
const { default: worker, NoahCloudJob, NoahCloudConnection, NoahCloudBudget } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const owner = 'a'.repeat(64), project = 'project-' + 'b'.repeat(64);
const request = input => new Request('https://runtime.test', { method: 'POST', body: JSON.stringify(input) });
function context(data = new Map()) {
  const tasks = [];
  let serial = Promise.resolve();
  return { data, tasks, alarmAt: null, storage: {
    async get(key) { return structuredClone(data.get(key)); }, async put(key, value) { data.set(key, structuredClone(value)); },
    async setAlarm(at) { data.set('alarmAt', at); }, async deleteAll() { data.clear(); },
  }, blockConcurrencyWhile(fn) { const result = serial.then(fn); serial = result.catch(() => {}); return result; }, waitUntil(p) { tasks.push(p); } };
}
void test('runtime is private and never accepts browser origins or unknown profiles', async () => {
  const key = crypto.randomUUID() + crypto.randomUUID(); let calls = 0;
  const env = { NOAH_CLOUD_KEY: key, CONNECTIONS: { getByName() { calls++; return { fetch: async () => Response.json({ ok: true }) }; } } };
  const make = (headers, patch = {}) => new Request('https://runtime.test/rpc', { method: 'POST', headers, body: JSON.stringify({ owner, project, profile: 'hermes', action: 'status', ...patch }) });
  assert.equal((await worker.fetch(make({}), env)).status, 401);
  assert.equal((await worker.fetch(make({ Authorization: `Bearer ${key}`, Origin: 'https://avoado.si' }), env)).status, 404);
  assert.equal((await worker.fetch(make({ Authorization: `Bearer ${key}` }, { profile: '__proto__' }), env)).status, 400);
  assert.equal((await worker.fetch(make({ Authorization: `Bearer ${key}` }), env)).status, 200);
  assert.equal((await worker.fetch(make({ Authorization: `Bearer ${key}` }, { action: 'start', distribution: 'b'.repeat(64) }), env)).status, 409);
  assert.equal(calls, 1);
});
void test('only the private free official Eve start accepts the advice purpose and binds it to the existing owner and job ID', async () => {
  const key = 'worker-test-' + 'x'.repeat(40);
  const jobs = new Map(), connections = new Map();
  let admissions = 0;
  const env = {
    NOAH_CLOUD_KEY: key, NOAH_CLOUD_MODE: 'free',
    BUDGET: { getByName: () => ({ async fetch() { admissions++; return Response.json({ ok: true }); } }) },
    JOBS: { getByName(name) {
      if (!jobs.has(name)) {
        const obj = new NoahCloudJob(context(), env);
        obj.schedule = async () => {};
        obj.recover = async () => {};
        jobs.set(name, { fetch: (url, init) => obj.fetch(new Request(url, init)) });
      }
      return jobs.get(name);
    } },
    CONNECTIONS: { getByName(name) {
      if (!connections.has(name)) {
        const ctx = context();
        if (name === owner + ':' + NOAH_EVE_HERMES_PROJECT + ':hermes') ctx.data.set('connection', { id: id(1), state: 'connected', revision: 1, jobs: [] });
        const conn = new NoahCloudConnection(ctx, env);
        connections.set(name, { fetch: (url, init) => conn.fetch(new Request(url, init)) });
      }
      return connections.get(name);
    } },
  };
  const payload = { action: 'start', owner, project: NOAH_EVE_HERMES_PROJECT, profile: 'hermes', distribution: NOAH_CLOUD_PROFILES.hermes.sha256, connectionId: id(1), jobId: id(2), prompt: 'Goal', purpose: NOAH_EVE_ADVICE_PURPOSE };
  const rpc = (body, config = env, auth = key) => worker.fetch(new Request('https://worker/rpc', { method: 'POST', headers: { Authorization: 'Bearer ' + auth }, body: JSON.stringify(body) }), config);
  assert.equal((await rpc(payload, env, 'wrong')).status, 401);
  for (const patch of [{ action: 'connect' }, { mode: 'probe' }, { purpose: 'invalid' }, { profile: 'boss' }, { project }]) assert.equal((await rpc({ ...payload, ...patch })).status, 400);
  assert.equal((await rpc(payload, { ...env, NOAH_CLOUD_MODE: 'paid' })).status, 400);
  assert.equal(admissions, 0);
  const started = await rpc(payload);
  assert.equal(started.status, 202);
  assert.equal((await started.json()).purpose, NOAH_EVE_ADVICE_PURPOSE);
  const again = await rpc(payload);
  assert.equal(again.status, 200);
  assert.equal((await again.json()).purpose, NOAH_EVE_ADVICE_PURPOSE);
  assert.equal((await rpc({ ...payload, purpose: undefined })).status, 409);
  assert.equal((await rpc({ ...payload, action: 'job', purpose: undefined, owner: 'c'.repeat(64) })).status, 404);
  assert.equal(admissions, 1);
});
void test('global budget serializes admission, keeps midnight leases, and releases only the given job', async () => {
  const ctx = context(), budget = new NoahCloudBudget(ctx, {});
  const admit = n => budget.fetch(request({ id: id(n), owner, mode: 'run' }));
  assert.deepEqual((await Promise.all([admit(1), admit(2), admit(3)])).map(r => r.status), [200, 200, 429]);
  const state = ctx.data.get('budget'); state.day = 'old-day'; ctx.data.set('budget', state);
  assert.equal((await admit(4)).status, 429, 'midnight must not reset running-instance admission');
  await budget.fetch(request({ action: 'release', id: id(1) }));
  assert.equal((await admit(4)).status, 200);
});
void test('model routing and caps are server-owned; result hashes and paths are checked', async () => {
  const input = noahCloudModelInput({ messages: [{ role: 'user', content: 'hello' }], model: 'attacker-model', base_url: 'http://private/', headers: { Authorization: 'not-forwarded' }, max_tokens: 999999, stream: true });
  assert.equal(input.max_tokens, 2048); assert.equal(input.stream, false); assert.equal(input.model, undefined); assert.equal(input.headers, undefined);
  assert.throws(() => noahCloudModelInput({ messages: [{ role: 'user', content: [{ image_url: 'http://internal/' }] }] }));
  await assert.rejects(noahCloudResult({ type: 'result', exitCode: 0, text: 'x', files: [{ name: '../secret', base64: '', bytes: 0, sha256: '' }] }, 1));
  await assert.rejects(noahCloudResult({ type: 'result', exitCode: 0, text: 'x', files: [{ name: 'x.txt', base64: 'eA==', bytes: 1, sha256: 'f'.repeat(64) }] }, 1));
  assert.equal(noahCloudProfile('https://github.com/NousResearch/hermes-agent.git'), 'hermes');
  assert.equal(noahCloudProfile('https://github.com/NousResearch/hermes-agent/evil'), null);
});
void test('a tool-only model reply can resume with the official tool result', () => {
  const call = { id: 'time-call', type: 'function', function: { name: 'get_current_time', arguments: '{"timezone":"Asia/Tokyo"}' } };
  const messages = [
    { role: 'user', content: 'What time is it in Tokyo?' },
    { role: 'assistant', content: null, tool_calls: [call] },
    { role: 'tool', tool_call_id: call.id, content: '{"timezone":"Asia/Tokyo","datetime":"2026-11-23T00:07:47+09:00"}' },
  ];
  const input = noahCloudModelInput({ messages });
  assert.ok(input.messages.every(message => typeof message.content === 'string'), 'Workers AI rejects null content on continuation');
  assert.deepEqual(input.messages[1].tool_calls, [call]);
  assert.deepEqual(input.messages[2], messages[2], 'the result must remain bound to the tool call');
  assert.equal(messages[1].content, null, 'do not mutate the Agent transcript');
});
function jobWorld({ holdModel = false } = {}) {
  const ctx = context(); let starts = 0, stops = 0, calls = 0, writer, completeModel;
  const encoder = new TextEncoder();
  ctx.container = { images: { base: 'registry/image@sha256:pinned' },
    start(options) { starts++; assert.equal(options.enableInternet, false); assert.equal(options.env, undefined); },
    async setInactivityTimeout() {}, async destroy() { stops++; },
    getTcpPort() { return { async fetch(url, init) {
      if (url.endsWith('/health')) return Response.json({ ready: true });
      if (url.endsWith('/model-reply')) { writer.enqueue(encoder.encode(JSON.stringify({ type: 'result', version: NOAH_CLOUD_PROFILES.hermes.version, exitCode: 0, text: 'official-result', files: [] }) + '\n')); writer.close(); return Response.json({ ok: true }); }
      const input = JSON.parse(init.body);
      if (input.mode === 'probe') return Response.json({ type: 'probe', profile: input.profile, version: NOAH_CLOUD_PROFILES[input.profile].version });
      return new Response(new ReadableStream({ start(controller) { writer = controller; controller.enqueue(encoder.encode(JSON.stringify({ type: 'model_request', id: '1'.repeat(32), body: { messages: [{ role: 'user', content: input.prompt }] } }) + '\n')); } }));
    } }; },
  };
  const env = { BUDGET: { getByName: () => ({ fetch: async () => Response.json({ ok: true }) }) }, AI: { async run() { calls++; if (holdModel) await new Promise(resolve => { completeModel = resolve; }); return { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: 'answer' } }] }; } } };
  const instance = new NoahCloudJob(ctx, env);
  return { ctx, env, instance, counts: () => ({ starts, stops, calls }), finishModel: () => completeModel?.() };
}
void test('the model protocol records one result and never replays the same job', async () => {
  const w = jobWorld(); const input = { action: 'start', owner, id: id(1), profile: 'hermes', mode: 'run', prompt: 'input' };
  assert.equal((await w.instance.fetch(request(input))).status, 202); await Promise.all(w.ctx.tasks);
  const result = await (await w.instance.fetch(request({ action: 'get' }))).json();
  assert.equal(result.state, 'returned'); assert.equal(result.result.text, 'official-result'); assert.equal(result.result.calls, 1);
  assert.equal(result.owner, undefined); assert.equal(result.prompt, undefined);
  assert.equal((await w.instance.fetch(request(input))).status, 200);
  assert.equal((await w.instance.fetch(request({ ...input, prompt: 'changed' }))).status, 409);
  assert.deepEqual(w.counts(), { starts: 1, stops: 1, calls: 1 });
});
void test('stop wins against a late model result and restart does not re-execute', async () => {
  const w = jobWorld({ holdModel: true });
  await w.instance.fetch(request({ action: 'start', owner, id: id(2), profile: 'hermes', mode: 'run', prompt: 'input' }));
  while (!w.counts().calls) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal((await (await w.instance.fetch(request({ action: 'stop' }))).json()).state, 'cancelled');
  w.finishModel(); await Promise.all(w.ctx.tasks);
  assert.equal((await (await w.instance.fetch(request({ action: 'get' }))).json()).state, 'cancelled');
  const fresh = jobWorld(); fresh.ctx.data.set('job', { id: id(3), owner, profile: 'hermes', mode: 'run', state: 'running', deadlineAt: Date.now() + 60000 });
  assert.equal((await (await fresh.instance.fetch(request({ action: 'get' }))).json()).state, 'unknown'); assert.equal(fresh.counts().starts, 0);
});
void test('a stop before the execution claim prevents any container start', async () => {
  const w = jobWorld();
  w.ctx.data.set('job', { id: id(3), owner, profile: 'hermes', mode: 'run', state: 'queued', deadlineAt: Date.now() + 60000 });
  await Promise.all([w.instance.end('cancelled', 'stop'), w.instance.execute()]);
  assert.equal(w.ctx.data.get('job').state, 'cancelled'); assert.equal(w.counts().starts, 0);
});
void test('receipt retry never replays the guest and unacknowledged results survive the next-day alarm', async t => {
  const w = jobWorld(); let deliveries = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => { deliveries++; assert.equal(url, 'https://avoado.si/api/noah/cloud-agents/result'); assert.equal(init.redirect, 'manual'); return Response.json({ saved: deliveries > 1 }, { status: deliveries > 1 ? 200 : 503 }); });
  await w.instance.fetch(request({ action: 'start', owner, id: id(7), profile: 'hermes', mode: 'run', prompt: 'input', receipt: 'a'.repeat(40) }));
  await Promise.all(w.ctx.tasks);
  assert.equal(w.ctx.data.get('job').delivered, undefined);
  const job = w.ctx.data.get('job'); job.completedAt -= 86400000; w.ctx.data.set('job', job);
  await w.instance.alarm();
  assert.equal(w.ctx.data.get('job').delivered, true); assert.equal(deliveries, 2); assert.equal(w.counts().starts, 1);
});
void test('connection refuses expired-ID replay after disconnect and keeps owned job isolation', async () => {
  const ctx = context(), records = new Map(), env = {};
  env.JOBS = { getByName(name) { return { async fetch(req, init) {
    const input = JSON.parse(init.body); const old = records.get(name);
    if (input.action === 'get') return old ? Response.json(old) : Response.json({ error: 'missing' }, { status: 404 });
    if (input.action === 'stop') return Response.json({ ...old, state: 'cancelled' });
    const result = { id: input.id, profile: input.profile, mode: input.mode, state: input.mode === 'probe' ? 'returned' : 'queued' }; records.set(name, result); return Response.json(result, { status: 202 });
  } }; } };
  const c = new NoahCloudConnection(ctx, env), call = data => c.fetch(request({ owner, project, profile: 'hermes', ...data }));
  await call({ action: 'connect', id: id(10) }); assert.equal((await (await call({ action: 'status' })).json()).connection.state, 'connected');
  await call({ action: 'start', connectionId: id(10), jobId: id(11), prompt: 'hello' });
  assert.equal((await call({ action: 'job', jobId: id(99) })).status, 404);
  await call({ action: 'disconnect' }); records.delete(`${owner}:${id(11)}`);
  assert.equal((await call({ action: 'start', connectionId: id(10), jobId: id(11), prompt: 'hello' })).status, 409);
  assert.equal(records.has(`${owner}:${id(11)}`), false);
});

void test('free CLI caps are three per owner and ten total per UTC day, persist across restart, and reject without reserving', async t => {
  let now = Date.UTC(2026, 10, 23, 23, 59, 59);
  t.mock.method(Date, 'now', () => now);
  const ctx = context(), env = { NOAH_CLOUD_MODE: 'free' };
  let budget = new NoahCloudBudget(ctx, env);
  const admit = (n, who) => budget.fetch(request({ id: id(n), owner: who, mode: 'run' }));
  const release = n => budget.fetch(request({ action: 'release', id: id(n) }));
  for (let n = 1; n <= 3; n++) {
    assert.equal((await admit(n, owner)).status, 200);
    await release(n);
  }
  budget = new NoahCloudBudget(context(ctx.data), env);
  const before = structuredClone(ctx.data.get('budget'));
  assert.equal((await admit(4, owner)).status, 429);
  assert.deepEqual(ctx.data.get('budget'), before);
  for (let n = 4; n <= 10; n++) {
    assert.equal((await admit(n, `owner-${n}`)).status, 200);
    await release(n);
  }
  const full = structuredClone(ctx.data.get('budget'));
  assert.equal(full.jobs, 10);
  assert.equal((await admit(11, 'new-owner')).status, 429);
  assert.deepEqual(ctx.data.get('budget'), full);
  // The free runtime inherits this admission gate: a full budget must not
  // create a job, schedule execution, or reach a model/container.
  const rejected = jobWorld();
  rejected.env.BUDGET = { getByName: () => ({ fetch: (url, init) => budget.fetch(new Request(url, init)) }) };
  const response = await rejected.instance.fetch(request({ action: 'start', owner: 'new-owner', id: id(12), profile: 'hermes', mode: 'run', prompt: 'do not execute' }));
  assert.equal(response.status, 429);
  assert.match((await response.json()).error, /クラウドの利用枠/);
  assert.equal(rejected.ctx.data.has('job'), false);
  assert.equal(rejected.ctx.tasks.length, 0);
  assert.deepEqual(rejected.counts(), { starts: 0, stops: 0, calls: 0 });
  now += 1000;
  assert.equal((await admit(11, owner)).status, 200);
  assert.equal(ctx.data.get('budget').day, '2026-11-24');
  assert.equal(ctx.data.get('budget').jobs, 1);
});
