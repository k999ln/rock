import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { createExecutionManager, executionRequest, executionMiddleware } from '../scripts/noah-executions.mjs';
import { containerArgs, localModel, validateResult } from '../scripts/noah-isolated-runtime.mjs';
import { RECIPES, recipeFor, MODEL } from '../scripts/noah-execution-recipes.mjs';
import { sha256, InstallError, sourcePlan } from '../scripts/noah-source-fetch.mjs';
import { createNoahWork, updateNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { normalizeWorkJob, applyWorkCommand } from '../lib/workflow.ts';

const agentId = 'research-ce4e58553bea6313acf7', scope = `owner-v1:${'a'.repeat(64)}`, claim = 'b'.repeat(64);
const input = () => ({ id: randomUUID(), agentId, prompt: 'Create result.txt with HELLO' });
const binding = async prompt => ({ agentId, recipe: 'aider', version: '0.86.2', image: `sha256:${'d'.repeat(64)}`, model: 'qwen3:4b', prompt, inputSha256: await executionInputDigest(agentId, prompt), claimSha256: sha256(claim) });
const file = { name: 'result.txt', base64: Buffer.from('HELLO').toString('base64'), sha256: sha256('HELLO'), bytes: 5 };
const result = { text: 'created', files: [file], exitCode: 0 };
const until = async f => { for (let i = 0; i < 100; i++) { if (f()) return; await new Promise(r => setTimeout(r, 5)); } assert.fail('did not settle'); };

void test('reviewed recipes route actual official agents; arbitrary catalog commands remain inert', () => {
  for (const id of Object.keys(RECIPES)) {
    assert.equal(sourcePlan({ id, kind: 'agent', command: 'touch /host/file' }).adapter, id === 'anicca' ? 'anicca' : recipeFor(id).provider ? 'codex' : 'isolated');
    assert.ok(recipeFor(id).version);
  }
  assert.equal(recipeFor('__proto__'), null);
  assert.throws(() => executionRequest({ ...input(), command: 'rm -rf /' }));
  assert.throws(() => executionRequest({ ...input(), agentId: 'research-' + 'f'.repeat(20) }));
  assert.throws(() => executionRequest({ ...input(), prompt: 'あ'.repeat(5000) }));
});

void test('container grants no host mount, network, credential or privileged capability', () => {
  const args = containerArgs('noah-test', 'sha256:abc');
  for (const [flag, value] of [['--network', 'none'], ['--user', '10001:10001'], ['--cap-drop', 'ALL'], ['--security-opt', 'no-new-privileges']]) assert.equal(args[args.indexOf(flag) + 1], value);
  assert.ok(args.includes('--read-only'));
  for (const flag of ['--privileged', '--volume', '-v', '--mount', '--env-file', '--pid', '--device', '--publish']) assert.ok(!args.includes(flag));
  assert.equal(args.filter(x => x === '--tmpfs').length, 3);
});

void test('model gateway pins local target/model, drops agent routing and caps output', async () => {
  let seen;
  const answer = await localModel({ messages: [{ role: 'user', content: 'test' }], model: 'paid-model', api_base: 'https://attacker.invalid', max_tokens: 100000, stream: true }, new AbortController().signal,
    async (url, options) => { seen = [url, JSON.parse(options.body)]; return Response.json({ done: true, message: { content: 'ok' } }); });
  assert.equal(answer.choices[0].message.content, 'ok');
  assert.equal(seen[0], 'http://127.0.0.1:11434/api/chat');
  assert.equal(seen[1].model, MODEL); assert.equal(seen[1].options.num_predict, 2048); assert.equal(seen[1].stream, false); assert.equal(seen[1].think, false); assert.ok(!('api_base' in seen[1]));
  await assert.rejects(localModel({ messages: [{ role: 'user', content: [{ type: 'image_url', image_url: 'file:///private/key' }] }] }, new AbortController().signal));
});

void test('model transport denies oversized responses and unavailable providers', async () => {
  const signal = new AbortController().signal, body = { messages: [{ role: 'user', content: 'test' }] };
  await assert.rejects(localModel(body, signal, async () => new Response('no', { status: 503 })));
  await assert.rejects(localModel(body, signal, async () => new Response('x'.repeat(270000))));
  await assert.rejects(localModel(body, signal, async () => Response.json({ done: true, message: { content: '', thinking: 'unfinished' } })), /モデルが応答や操作を返しませんでした/);
});

void test('model gateway preserves smaller SDK output reserves without lifting the host cap', async () => {
  for (const [requested, expected] of [[1024, 1024], [999999, 2048], [-1, 2048], [1.5, 2048]]) {
    let sent;
    await localModel({ messages: [{ role: 'user', content: 'test' }], max_tokens: requested }, new AbortController().signal, async (_url, options) => {
      sent = JSON.parse(options.body);
      return Response.json({ done: true, message: { content: 'ok' } });
    });
    assert.equal(sent.options.num_predict, expected);
    assert.equal(sent.options.num_ctx, 8192);
  }
});

void test('agent options cannot lift Noah CPU threads or retain its managed model indefinitely', async () => {
  for (const selectedModel of ['qwen2.5:1.5b', 'qwen3:4b', 'qwen2.5-tools:1.5b-v1']) {
    let sent, validations = 0;
    const handle = { model: 'noah-owned-reference', async validate() { validations++; } };
    await localModel({ messages: [{ role: 'user', content: 'hello' }], num_thread: 512,
      keep_alive: -1, options: { num_thread: 512, num_ctx: 999999, num_gpu: 999 } },
    new AbortController().signal, async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      sent = JSON.parse(options.body);
      return Response.json({ done: true, message: { content: 'ok' } });
    }, selectedModel, 2048, handle);
    assert.equal(validations, 1);
    assert.equal(sent.model, handle.model);
    assert.equal(sent.keep_alive, '30s');
    assert.deepEqual(sent.options, { num_predict: 2048, num_ctx: 8192, num_thread: 2, temperature: 0 });
    assert.equal(sent.num_thread, undefined);
  }
});

void test('parallel OpenAI Tool replies preserve each function name in the native model protocol', async () => {
  let sent;
  await localModel({ messages: [
    { role: 'user', content: 'Read then edit' },
    { role: 'assistant', content: null, tool_calls: [
      { id: 'read-id', function: { name: 'read_file', arguments: '{"file_path":"a.txt"}' } },
      { id: 'edit-id', function: { name: 'edit_file', arguments: { file_path: 'b.txt' } } },
    ] },
    { role: 'tool', tool_call_id: 'edit-id', content: 'edited' },
    { role: 'tool', tool_call_id: 'read-id', content: 'read' },
  ] }, new AbortController().signal, async (_url, options) => {
    sent = JSON.parse(options.body); return Response.json({ done: true, message: { content: 'ok' } });
  });
  assert.equal(sent.messages[2].tool_name, 'edit_file');
  assert.equal(sent.messages[3].tool_name, 'read_file');
  assert.deepEqual(sent.messages[1].tool_calls[0].function.arguments, { file_path: 'a.txt' });
  await assert.rejects(localModel({ messages: [{ role: 'user', content: 'test' }] },
    new AbortController().signal, async () => assert.fail('unprepared derivative must not call model'), 'qwen2.5-tools:1.5b-v1'));
});

void test('qwen3 thinking is enabled according to installed model metadata and never returned as answer', async () => {
  let sent;
  const r = await localModel({ messages: [{ role: 'user', content: [{ type: 'text', text: 'READY' }] }] }, new AbortController().signal, async (_url, options) => {
    sent = JSON.parse(options.body);
    return Response.json({ done: true, message: { content: 'READY', thinking: 'private intermediate trace' }, eval_count: 12 });
  }, 'qwen3:4b');
  assert.equal(sent.think, true); assert.equal(sent.model, 'qwen3:4b');
  assert.equal(r.choices[0].message.content, 'READY'); assert.ok(!JSON.stringify(r).includes('private intermediate'));
});

void test('trusted Aider budget reserves room for reasoning and output, while SDK input cannot increase it', async () => {
  for (const [configured, expected] of [[4096, 4096], [999999, 2048]]) {
    let sent;
    await localModel({ messages: [{ role: 'user', content: 'test' }], max_tokens: 999999, outputTokens: 999999 }, new AbortController().signal, async (_url, options) => {
      sent = JSON.parse(options.body); return Response.json({ done: true, message: { content: 'ok' } });
    }, 'qwen3:4b', configured);
    assert.equal(sent.options.num_predict, expected); assert.equal(sent.options.num_ctx, 8192);
  }
});

void test('artifact evidence checks size, traversal, duplicate names and SHA256', () => {
  assert.deepEqual(validateResult({ type: 'result', ...result }), result);
  for (const bad of [{ ...file, name: '../key' }, { ...file, name: '/etc/passwd' }, { ...file, bytes: 9 }, { ...file, sha256: '0'.repeat(64) }]) assert.throws(() => validateResult({ type: 'result', ...result, files: [bad] }));
  assert.throws(() => validateResult({ type: 'result', ...result, files: [file, file] }));
});

void test('Work preserves unverified result, zero cost and separates return from business completion', async () => {
  let job = await createNoahWork(randomUUID(), await binding('Write HELLO'));
  assert.equal(normalizeWorkJob(job).templateId, 'noah-agent-local');
  job = await updateNoahWork(job, { action: 'start', claim });
  job = await updateNoahWork(job, { action: 'finish', claim, state: 'returned', result, calls: 1 });
  assert.equal(job.status, 'review'); assert.equal(job.steps[0].passed, false);
  assert.equal(job.noahExecution.chargeMinor, 0); assert.equal(job.noahExecution.verification, 'host_observed_unverified');
  assert.throws(() => applyWorkCommand(job, { id: randomUUID(), action: 'complete' }, job.revision));
  await assert.rejects(updateNoahWork(job, { action: 'start', claim }));
});

void test('Work rejects mismatched recipe/input, forged capability and unsafe artifacts', async () => {
  await assert.rejects(createNoahWork(randomUUID(), { ...await binding('test'), agentId: '__proto__', recipe: undefined, version: undefined, inputSha256: await executionInputDigest('__proto__', 'test') }));
  await assert.rejects(createNoahWork(randomUUID(), { ...await binding('test'), version: 'latest' }));
  await assert.rejects(createNoahWork(randomUUID(), { ...await binding('test'), inputSha256: 'e'.repeat(64) }));
  const job = await createNoahWork(randomUUID(), await binding('test'));
  await assert.rejects(updateNoahWork(job, { action: 'start', claim: 'f'.repeat(64) }), { status: 403 });
  await assert.rejects(updateNoahWork(job, { action: 'finish', claim, state: 'returned', calls: 9, result }));
  await assert.rejects(updateNoahWork(job, { action: 'finish', claim, state: 'returned', calls: 1, result: { ...result, files: [{ ...file, name: '../../secret' }] } }));
});

function harness(run = async () => ({ ...result, calls: 1 })) {
  const saved = new Map(); let executions = 0;
  const runtime = { execution: { image: `sha256:${'d'.repeat(64)}` }, async run(...args) { executions++; return run(...args); } };
  const installations = { async execution() { return runtime; } };
  const work = async (action, value) => {
    if (action === 'get') { if (!saved.has(value.id)) throw new InstallError('missing', 404); return { job: saved.get(value.id) }; }
    if (action === 'create') { const job = await createNoahWork(value.id, value.binding); saved.set(job.id, job); return { job }; }
    const job = await updateNoahWork(saved.get(value.id), { ...value, action }); saved.set(job.id, job); return { job };
  };
  return { manager: createExecutionManager(installations), work, saved, get executions() { return executions; } };
}
void test('ten identical clicks execute once; changed input conflicts and persisted retry never reexecutes', async () => {
  const h = harness(), request = input();
  await Promise.all(Array.from({ length: 10 }, () => h.manager.start(scope, request, h.work, async () => {})));
  await until(() => h.saved.get(request.id)?.noahExecution.state === 'returned');
  assert.equal(h.executions, 1);
  await assert.rejects(h.manager.start(scope, { ...request, prompt: 'different' }, h.work, async () => {}), { status: 409 });
  await h.manager.close();
  const fresh = createExecutionManager({ execution: async () => { assert.fail('must not restart stored job'); } });
  await fresh.start(scope, request, h.work, async () => {}); assert.equal(h.executions, 1);
  await fresh.close();
});

void test('stop cancels actual owned run; another owner cannot stop it; new request can run afterwards', async () => {
  const h = harness((_prompt, signal) => new Promise((_resolve, reject) => { signal.throwIfAborted(); signal.addEventListener('abort', () => reject(new InstallError('stopped')), { once: true }); }));
  const request = input(); await h.manager.start(scope, request, h.work, async () => {});
  await until(() => h.executions === 1);
  await h.manager.stop(`owner-v1:${'c'.repeat(64)}`, request.id, async () => { throw new InstallError('missing', 404); }).catch(() => {});
  assert.equal(h.saved.get(request.id).noahExecution.state, 'running');
  await h.manager.stop(scope, request.id, h.work);
  assert.equal(h.saved.get(request.id).noahExecution.state, 'cancelled');
  const next = input(); await h.manager.start(scope, next, h.work, async () => {}); await h.manager.close();
});

void test('lost host is unknown, owner revocation blocks start, concurrent job exceeds quota', async () => {
  const h = harness(); const request = input();
  await assert.rejects(h.manager.start(scope, request, h.work, async () => { throw new InstallError('owner changed', 403); })); assert.equal(h.executions, 0);
  const job = await createNoahWork(randomUUID(), await binding('test'));
  assert.equal(h.manager.view(scope, job).noahExecution.state, 'unknown');
  const long = harness((_p, s) => new Promise((_r, reject) => s.addEventListener('abort', () => reject(new Error()), { once: true })));
  await long.manager.start(scope, input(), long.work, async () => {}); await until(() => long.executions === 1);
  await assert.rejects(long.manager.start(scope, input(), long.work, async () => {}), { status: 429 }); await long.manager.close();
});

void test('unconfirmed container teardown is unknown, never a successful stop', async () => {
  const h = harness(async () => { throw Object.assign(new InstallError('teardown unconfirmed'), { unconfirmed: true }); });
  const request = input(); await h.manager.start(scope, request, h.work, async () => {});
  await until(() => h.saved.get(request.id)?.noahExecution.state === 'unknown');
  assert.equal(h.saved.get(request.id).status, 'review'); await h.manager.close();
});

void test('HTTP boundary denies wrong Origin, owner scope, nonlocal host and unknown command keys', async () => {
  const manager = createExecutionManager({});
  async function call({ headers = {}, address = '127.0.0.1', body = input() } = {}) {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    Object.assign(req, { url: '/__noah/executions', method: 'POST', headers: { host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107', 'content-type': 'application/json', 'x-rock-owner-scope': scope, ...headers }, socket: { remoteAddress: address } });
    let status;
    const response = { writeHead(s) { status = s; }, end() {} };
    await executionMiddleware({ manager, port: 3107, getOwner: async () => ({ ownerScope: scope, localHostOwner: true }), workFor: () => async () => { throw new InstallError('missing', 404); } })(req, response, () => assert.fail());
    return status;
  }
  assert.equal(await call({ headers: { origin: 'https://attacker.invalid' } }), 403);
  assert.equal(await call({ headers: { 'x-rock-owner-scope': 'wrong' } }), 409);
  assert.equal(await call({ address: '192.168.1.2' }), 403);
  assert.equal(await call({ body: { ...input(), command: 'arbitrary' } }), 400);
});

void test('Japanese request survives UTF-8 characters split across network chunks', async () => {
  const value = { ...input(), prompt: '日本語で集計結果を保存してください。' };
  const req = Readable.from([...Buffer.from(JSON.stringify(value))].map(byte => Buffer.from([byte])));
  Object.assign(req, { url: '/__noah/executions', method: 'POST', headers: { host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107', 'content-type': 'application/json', 'x-rock-owner-scope': scope }, socket: { remoteAddress: '127.0.0.1' } });
  let received, status;
  const manager = { async start(_scope, input) { received = input; return {}; } };
  await executionMiddleware({ manager, port: 3107, getOwner: async () => ({ ownerScope: scope, localHostOwner: true }), workFor: () => {} })(req, { writeHead(s) { status = s; }, end() {} }, () => assert.fail());
  assert.equal(status, 202); assert.deepEqual(received, value);
});
