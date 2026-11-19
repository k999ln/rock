import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { createCodexChannel, codexThreadParams, assertCodexThread, codexProcessArgs } from '../scripts/noah-codex-channel.mjs';
import { createCodexWorkspace } from '../scripts/noah-codex-workspace.mjs';
import { runCodexIsolated } from '../scripts/noah-codex-runtime.mjs';
import { executionRequest, createExecutionManager } from '../scripts/noah-executions.mjs';
import { createNoahWork, updateNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { sha256, InstallError } from '../scripts/noah-source-fetch.mjs';

const agentId = 'research-adc2fb98c295eaf3fc52';
const validThread = () => ({ thread: { id: 'thread-test', ephemeral: true, environments: [] }, runtimeWorkspaceRoots: [], instructionSources: [], model: 'test-model', modelProvider: 'openai', approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false } });
const provider = { name: 'openai-codex', model: 'test-model', version: 'codex-cli 0.1.0', sha256: 'e'.repeat(64), consent: 'codex-account/1', metric: 'provider_turns' };
const file = { name: 'result.txt', bytes: 3, base64: Buffer.from('89\n').toString('base64'), sha256: sha256('89\n') };
const result = { text: '計算結果', exitCode: 0, files: [file] };
const turn = { id: 'turn-test', status: 'completed' };

void test('thread and process disable the host surface and reject an unconfirmed environment', () => {
  const p = codexThreadParams('/empty', ['browser', 'private_account']);
  assert.deepEqual(p.environments, []); assert.deepEqual(p.runtimeWorkspaceRoots, []);
  assert.equal(p.config['mcp_servers.browser.enabled'], false); assert.equal(p.config['mcp_servers.private_account.enabled'], false);
  assert.equal(p.config['features.computer_use'], false); assert.equal(p.config['features.browser_use'], false); assert.equal(p.config['orchestrator.mcp.enabled'], false);
  assert.deepEqual(p.dynamicTools.map(t => t.name), ['noah_workspace']);
  assert.ok(!codexProcessArgs().some(x => x.includes('dangerously')));
  assert.throws(() => codexThreadParams('/empty', ['unsafe.key']));
  assertCodexThread(validThread());
  for (const change of [{ thread: { id: 't', environments: null, ephemeral: true } }, { thread: { id: 't', environments: [{ id: 'host' }], ephemeral: true } }, { sandbox: { type: 'dangerFullAccess' } }, { instructionSources: ['/private/config'] }, { modelProvider: 'other' }, { runtimeWorkspaceRoots: ['/Users'] }, { approvalPolicy: 'on-request' }]) assert.throws(() => assertCodexThread({ ...validThread(), ...change }));
  assert.throws(() => assertCodexThread(validThread(), 'different-model'));
});

void test('JSONL channel preserves split UTF-8, refuses host approval and bounds shutdown', async () => {
  const child = new EventEmitter(); child.exitCode = null; child.signalCode = null; child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const sent = [];
  child.stdin = new Writable({ write(bytes, _encoding, done) { const m = JSON.parse(bytes); sent.push(m); if (m.method === 'echo') { const b = Buffer.from(JSON.stringify({ id: m.id, result: '日本語' }) + '\n'); const at = b.indexOf(Buffer.from('日')) + 1; queueMicrotask(() => { child.stdout.write(b.subarray(0, at)); child.stdout.write(b.subarray(at)); }); } done(); } });
  child.kill = () => { child.signalCode = 'SIGTERM'; queueMicrotask(() => child.emit('close')); };
  const channel = createCodexChannel('/official', '/empty', { spawnProcess: () => child });
  assert.equal(await channel.rpc('echo', {}), '日本語');
  child.stdout.write(JSON.stringify({ id: 'foreign', method: 'item/commandExecution/requestApproval', params: { command: 'open browser' } }) + '\n');
  assert.equal(sent.at(-1).error.code, -32601);
  const pending = channel.rpc('waiting', {}).catch(e => e); await channel.stop(); assert.ok(await pending instanceof InstallError);
  await channel.stop();
});

void test('Codex consent binds the request digest and fixed provider identity into Work', async () => {
  const input = { id: randomUUID(), agentId, prompt: 'test' };
  assert.throws(() => executionRequest(input));
  const request = executionRequest({ ...input, providerConsent: 'codex-account/1' });
  assert.equal(request.digest, await executionInputDigest(agentId, input.prompt));
  const binding = { agentId, recipe: 'codex', version: 'noah-codex/1', image: `sha256:${'d'.repeat(64)}`, model: 'codex-account', provider, prompt: 'test', inputSha256: request.digest, claimSha256: sha256('a'.repeat(64)) };
  const work = await createNoahWork(input.id, binding);
  assert.deepEqual(work.noahExecution.provider, provider);
  for (const p of [undefined, { ...provider, consent: 'other' }, { ...provider, token: 'secret' }, { ...provider, metric: 'model_calls' }]) await assert.rejects(createNoahWork(input.id, { ...binding, provider: p }));
  await assert.rejects(updateNoahWork(work, { action: 'finish', claim: 'a'.repeat(64), state: 'returned', calls: 2, result }));
});

function runtimeFixture({ wrongThread = false, noTool = false, wait = false, stopFails = false } = {}) {
  const actions = []; let opts;
  const workspace = { async execute(input) { actions.push(['command', input]); return { exitCode: 0, output: '89' }; }, async collect(text) { return { ...result, text }; }, async stop() { actions.push(['container-stop']); if (stopFails) throw new Error('engine lost'); } };
  const channel = { async initialize() {}, onFailure() { return () => {}; }, async stop() { actions.push(['codex-stop']); }, async rpc(method, params) {
    actions.push([method, params]);
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'config/read') return { config: { mcp_servers: { private: { enabled: true } } } };
    if (method === 'thread/start') return validThread();
    if (method === 'turn/start') {
      opts.onEvent('turn/started', { threadId: 'thread-test', turn });
      if (!wait) {
        if (!noTool) await opts.onRequest({ threadId: wrongThread ? 'foreign' : 'thread-test', turnId: turn.id, tool: 'noah_workspace', namespace: null, callId: 'call1', arguments: { command: 'python test' } });
        opts.onEvent('item/completed', { threadId: 'thread-test', turnId: turn.id, item: { type: 'agentMessage', text: '計算結果' } });
        opts.onEvent('turn/completed', { threadId: 'thread-test', turn });
      }
      return { turn };
    }
  } };
  return { actions, run(signal = new AbortController().signal) { return runCodexIsolated({ root: '/root', cwd: '/empty', executable: '/official', image: 'image', model: 'test-model', prompt: 'test', signal, createChannel(_exe, _cwd, options) { opts = options; return channel; }, createWorkspace: async () => workspace }); } };
}
void test('real turn identity is checked even when tool/completion precedes RPC response', async () => {
  const f = runtimeFixture(), r = await f.run(); assert.equal(r.toolCalls, 1); assert.equal(r.calls, 1); assert.equal(r.files[0].name, 'result.txt');
  assert.equal(f.actions.filter(a => a[0] === 'container-stop').length, 1);
  const wrong = runtimeFixture({ wrongThread: true }); await assert.rejects(wrong.run()); assert.equal(wrong.actions.some(a => a[0] === 'command'), false);
  await assert.rejects(runtimeFixture({ noTool: true }).run(), /隔離Tool/);
  await assert.rejects(runtimeFixture({ stopFails: true }).run(), e => e.unconfirmed === true);
});
void test('stop interrupts the same provider turn and confirms both process boundaries', async () => {
  const f = runtimeFixture({ wait: true }), c = new AbortController(), running = f.run(c.signal);
  for (let i = 0; i < 20 && !f.actions.some(a => a[0] === 'turn/start'); i++) await new Promise(setImmediate);
  c.abort(); await assert.rejects(running, /停止/);
  assert.ok(f.actions.some(a => a[0] === 'turn/interrupt' && a[1].turnId === turn.id));
  assert.ok(f.actions.some(a => a[0] === 'codex-stop')); assert.ok(f.actions.some(a => a[0] === 'container-stop'));
});
void test('workspace command never reaches a host shell and unsuccessful cleanup stays unknown', async () => {
  const calls = [];
  const command = async (_root, args) => { calls.push(args); return args[0] === 'exec' ? JSON.stringify({ exitCode: 0, output: 'ok' }) : ''; };
  const w = await createCodexWorkspace('/root', 'sha256:fixed', new AbortController().signal, command);
  await w.execute({ command: 'touch /workspace/result.txt' }); await w.stop();
  const start = calls[0]; assert.equal(start[start.indexOf('--network') + 1], 'none'); assert.ok(start.includes('--read-only')); assert.ok(!start.includes('--mount'));
  assert.ok(!calls.flat().includes('touch /workspace/result.txt')); assert.equal(calls[1][0], 'exec');
  assert.ok(calls.some(a => a[0] === 'ps'));
  const broken = await createCodexWorkspace('/root', 'image', new AbortController().signal, async (_root, args) => args[0] === 'ps' ? 'still-present' : '');
  await assert.rejects(broken.stop(), e => e.unconfirmed === true);
});
void test('execution manager replays the Work rather than consuming the provider plan twice', async t => {
  let work, runs = 0;
  const runtime = { binding: { recipe: 'codex', version: 'noah-codex/1', model: 'codex-account', provider }, execution: { image: `sha256:${'d'.repeat(64)}` }, run: async (_prompt, _signal, onModel) => { runs++; await onModel(1); return result; } };
  const store = async (action, data) => { if (action === 'get' && !work) throw new InstallError('missing', 404); if (action === 'create') work = await createNoahWork(data.id, data.binding); else if (action !== 'get') work = await updateNoahWork(work, { ...data, action }); return { job: work }; };
  const manager = createExecutionManager({ execution: async () => runtime });
  t.after(() => manager.close());
  const request = { id: randomUUID(), agentId, prompt: 'test', providerConsent: 'codex-account/1' };
  await manager.start('scope', request, store, async () => {});
  const { job } = await manager.wait('scope', request.id, store);
  assert.equal(job.noahExecution.state, 'returned');
  assert.equal(job.noahExecution.calls, 1);
  const revision = work.revision; await manager.start('scope', request, store, async () => {});
  assert.equal(work.revision, revision); assert.equal(runs, 1); assert.equal(work.noahExecution.provider.metric, 'provider_turns');
});
