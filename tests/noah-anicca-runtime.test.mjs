import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runAnicca, aniccaContainerArgs, validateAniccaResponse } from '../scripts/noah-anicca-runtime.mjs';
import { ANICCA_PIN, matchesSourceReceipt, sourcePlan, sha256 } from '../scripts/noah-source-fetch.mjs';
import { codexStructuredThreadParams } from '../scripts/noah-codex-channel.mjs';
import { runCodexStructured } from '../scripts/noah-codex-runtime.mjs';
import { executionRequest } from '../scripts/noah-executions.mjs';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';
import { recipeFor } from '../lib/noah-execution-contract.mjs';

const prompt = 'Create a concrete plan for organizing synthetic documents in thirty minutes.';
const value = { answer: 'A synthetic plan', next_steps: ['Sort', 'Review'], limitations: ['No external action'] };
const options = () => ({ root: '/root', image: `sha256:${'d'.repeat(64)}`, model: 'test-model', prompt, signal: new AbortController().signal });

void test('Anicca rename preserves only the verified pinned source identity', () => {
  const plan = sourcePlan({ id: 'anicca', kind: 'agent' });
  assert.equal(plan.url, 'https://github.com/Daisuke134/anicca.git');
  const old = { url: 'https://github.com/Daisuke134/life-manager.git', commit: ANICCA_PIN };
  assert.equal(matchesSourceReceipt(plan, old), true);
  for (const change of [{ commit: 'a'.repeat(40) }, { url: 'https://github.com/foreign/life-manager.git' }]) assert.equal(matchesSourceReceipt(plan, { ...old, ...change }), false);
  assert.equal(matchesSourceReceipt({ ...plan, adapter: 'source' }, old), false);
  assert.equal(matchesSourceReceipt({ ...plan, pin: undefined }, old), false);
});

void test('Anicca has no host mounts, network, display or provider credentials', () => {
  const args = aniccaContainerArgs('sha256:fixed');
  for (const [key, expected] of [['--network', 'none'], ['--user', '10001:10001'], ['--memory', '1536m'], ['--cpus', '1.5']]) assert.equal(args[args.indexOf(key) + 1], expected);
  assert.ok(args.includes('--read-only')); assert.ok(args.includes('DISPLAY=')); assert.ok(!args.includes('--mount'));
  assert.equal(args.some(a => /CODEX_HOME|auth.json|docker.sock|--privileged/.test(a)), false);
  const thread = codexStructuredThreadParams('/empty', ['private'], 'test-model');
  assert.deepEqual(thread.dynamicTools, []); assert.deepEqual(thread.environments, []);
  assert.equal(thread.config['mcp_servers.private.enabled'], false);
});

void test('Anicca transport accepts one original prompt and fixed model, never guest routing', async () => {
  let calls = 0, sentSchema;
  await runAnicca(options(), {
    structured: async (_options, schema) => { calls++; sentSchema = schema; return { text: JSON.stringify(value) }; },
    protocol: async request => {
      for (const bad of [{ prompt, model: 'other' }, { prompt: 'other', model: 'test-model' }, { prompt, model: 'test-model', url: 'https://foreign' }]) await assert.rejects(request.model(bad, request.signal));
      const result = await request.model({ prompt, model: 'test-model' }, request.signal);
      assert.deepEqual(JSON.parse(result.text), value);
      await assert.rejects(request.model({ prompt, model: 'test-model' }, request.signal));
      return result;
    },
  });
  assert.equal(calls, 1); assert.equal(sentSchema.additionalProperties, false);
  assert.deepEqual(sentSchema.required, ['answer', 'next_steps', 'limitations']);
});

void test('schema errors and short inputs never become Anicca success', async () => {
  for (const invalid of ['bad', '{}', 'null', JSON.stringify({ ...value, answer: '' }), JSON.stringify({ ...value, extra: 'route' }), JSON.stringify({ ...value, next_steps: [42] }), JSON.stringify({ ...value, answer: 'a'.repeat(17000) })]) assert.throws(() => validateAniccaResponse(invalid));
  await assert.rejects(runAnicca({ ...options(), prompt: 'short' }, { protocol: () => assert.fail('must not launch') }), /16/);
  await assert.rejects(runAnicca(options(), { structured: async () => ({ text: '{}' }), protocol: r => r.model({ prompt, model: 'test-model' }, r.signal) }), /形式/);
});

void test('Anicca Work binds the source adapter version and explicit Codex send consent', async () => {
  const r = recipeFor('anicca'), request = { id: randomUUID(), agentId: 'anicca', prompt };
  assert.throws(() => executionRequest(request));
  assert.equal(executionRequest({ ...request, providerConsent: 'codex-account/1' }).digest, await executionInputDigest('anicca', prompt));
  const job = await createNoahWork(request.id, { agentId: 'anicca', recipe: r.key, version: r.version, model: r.model, image: options().image, prompt,
    inputSha256: await executionInputDigest('anicca', prompt), claimSha256: sha256('claim'),
    provider: { name: 'openai-codex', model: 'test-model', version: 'codex-cli 0.1.0', sha256: 'e'.repeat(64), consent: 'codex-account/1', metric: 'provider_turns' } });
  assert.ok(job.noahExecution.version.includes(ANICCA_PIN)); assert.equal(job.noahExecution.calls, 0);
});

void test('structured Codex keeps the tool-less boundary and waits for confirmed shutdown', async () => {
  let handlers, stopCalls = 0, params;
  const channel = { initialize: async () => {}, onFailure: () => () => {}, stop: async () => { stopCalls++; },
    rpc: async (method, p) => {
      if (method === 'account/read') return { account: { type: 'chatgpt' } };
      if (method === 'config/read') return { config: {} };
      if (method === 'thread/start') { assert.deepEqual(p.dynamicTools, []); return { thread: { id: 't', ephemeral: true, environments: [] }, runtimeWorkspaceRoots: [], instructionSources: [], approvalPolicy: 'never', sandbox: { type: 'readOnly', networkAccess: false }, modelProvider: 'openai', model: 'test-model' }; }
      if (method === 'turn/start') {
        params = p;
        handlers.onEvent('turn/started', { threadId: 't', turn: { id: 'turn' } });
        await assert.rejects(handlers.onRequest({ threadId: 't', turnId: 'turn', tool: 'noah_workspace', callId: 'c', arguments: { command: 'open browser' } }));
        handlers.onEvent('item/completed', { threadId: 't', turnId: 'turn', item: { type: 'agentMessage', text: JSON.stringify(value) } });
        handlers.onEvent('turn/completed', { threadId: 't', turn: { id: 'turn', status: 'completed' } });
        return { turn: { id: 'turn' } };
      }
    } };
  const run = () => runCodexStructured({ ...options(), cwd: '/empty', executable: '/official', createChannel: (_e, _c, h) => { handlers = h; return channel; }, createWorkspace: () => assert.fail('no workspace Tool') }, { type: 'object' });
  const result = await run(); assert.deepEqual(JSON.parse(result.text), value); assert.equal(result.calls, 1); assert.equal(stopCalls, 1); assert.deepEqual(params.outputSchema, { type: 'object' });
  channel.stop = async () => { throw new Error('stop unconfirmed'); };
  await assert.rejects(run(), e => e.unconfirmed === true);
});
