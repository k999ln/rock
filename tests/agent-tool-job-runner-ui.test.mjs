import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto, randomUUID, createHash } from 'node:crypto';
import ts from 'typescript';
import * as requirements from '../lib/sky-agent-requirements.ts';
import * as packageApi from '../lib/sky-tool-package.ts';
import * as runtime from '../lib/sky-package-runtime.ts';
import * as intent from '../lib/owner-intent.ts';
import * as access from '../lib/rockstar-service-package-access.ts';

const compile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const parentSource = compile('../components/agent-tool-job-runner.tsx');
const childSource = compile('../components/mcp-bot-runner.tsx');
const hubSource = compile('../lib/mcp-hub.ts');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

function harness({ realConnector = true, cancelBeforeConnector = false, claimFailure = '', responseMismatch = '', stopAfterClaim = false } = {}) {
  const manifest = packageApi.createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/example/tool', developerName: 'Example', developerId: 'example', license: 'MIT' });
  const packageKey = packageApi.skyToolPackageKey(manifest), manifestSha256 = 'b'.repeat(64), owner = 'owner-v1:' + 'a'.repeat(64);
  const agent = { id: '2e762de5-1f39-4a8a-95f9-03f8910b1630', revision: 1, name: '担当', instructions: '作業',
    provider: 'local-model', model: 'fixture-model', enabled: true, source: 'personal', sourceTool: null, updatedAt: 0,
    requirements: { inputFields: [], outputFields: [], packageKey, executionTarget: 'pc' } };
  const server = { id: 's', name: 'PC', state: 'connected', transport: 'stdio', passport: { server: { version: '1' }, tools: [{ name: 'op',
    description: 'fixture', inputSchema: manifest.io.inputSchema, outputSchema: manifest.io.outputSchema, pricing: { model: 'free', note: '' } }] } };
  const registry = { packages: [{ packageKey, manifest, manifestSha256, status: 'verified', installable: true }] };
  const entitlements = { ownerScope: owner, entitlements: [{ status: 'active', serviceProfile: { state: 'ready', activation: 'owner_choice_required', packages: [{ packageKey, state: 'ready' }] } }] };
  const initialJob = { id: 'job-fixture', revision: 1, status: 'active', events: [], agentBinding: { agentId: agent.id, agentRevision: 1 }, toolAttempts: [], toolObservations: [] };
  let savedJob = structuredClone(initialJob), displayedJob = structuredClone(initialJob), scope = owner, current = true;
  let beginGate = null, beginFailure = '', staleAfterBegin = false, changedAgent = false, changedEntitlementOwner = false;
  const capability = { token: 'x'.repeat(43), expiresAt: Date.now() + 60_000 };
  const events = [], slots = { parent: [], child: [] }; let cursor = 0, component = 'parent', tree, running = false;
  const react = {
    useState(initial) { const list = slots[component], i = cursor++; if (!list[i]) { const item = { value: typeof initial === 'function' ? initial() : initial }; item.set = v => { item.value = typeof v === 'function' ? v(item.value) : v; }; list[i] = item; } return [list[i].value, list[i].set]; },
    useRef(initial) { const list = slots[component], i = cursor++; return list[i] ??= { current: initial }; },
    useMemo(fn) { cursor++; return fn(); },
  };
  const mcp = { listMcpConnections: async () => [server], disconnectMcp: async () => {},
    prepareMcpTool: async (serverId, name, args) => { events.push({ kind: 'prepare', serverId, name, args }); return { approvalToken: 'fixture-token', summary: 'fixture' }; },
    executeApprovedMcpTool: async (serverId, name, args, token) => { events.push({ kind: 'execute', serverId, name, args, token }); return { text: '結果' }; },
  };
  async function fetch(url, options = {}) {
    if (url === 'http://fixture-connector/servers') return Response.json({ servers: [server] });
    if (url === 'http://fixture-connector/servers/s/prepare') {
      const body = JSON.parse(options.body); events.push({ kind: 'prepare', name: body.name, args: body.arguments });
      return Response.json({ approvalToken: 'fixture-token', summary: 'fixture' });
    }
    if (url === 'http://fixture-connector/servers/s/execute') {
      const body = JSON.parse(options.body); events.push({ kind: 'connector-request', body });
      // A synthetic authority chooses between cancellation and claim before
      // any simulated Tool effect; the real client builds the jobGate.
      if (cancelBeforeConnector) {
        savedJob = { ...savedJob, revision: savedJob.revision + 1, status: 'cancelled' };
        events.push({ kind: 'external-cancel', revision: savedJob.revision });
      }
      const gate = body.jobGate, attempt = savedJob.toolAttempts?.[0];
      const digest = createHash('sha256').update(JSON.stringify(body.arguments)).digest('hex');
      events.push({ kind: 'claim', jobGate: gate, digest });
      if (claimFailure || savedJob.status !== 'active' || gate?.jobId !== savedJob.id || gate?.attemptId !== attempt?.id ||
          gate?.agentId !== agent.id || gate.agentRevision !== agent.revision || gate.ownerScope !== owner ||
          gate.token !== capability.token || attempt.inputSha256 !== digest) {
        if (claimFailure === 'unknown') throw new Error('fixture claim response lost');
        return Response.json({ error: 'job_claim_unknown', message: '仕事の実行許可を確認できません。' }, { status: 409 });
      }
      savedJob = { ...savedJob, revision: savedJob.revision + 1, toolAttempts: [{ ...attempt, state: 'claimed', claimedRevision: savedJob.revision + 1 }] };
      const jobClaim = { jobId: gate.jobId, attemptId: gate.attemptId, inputSha256: digest, jobRevision: savedJob.revision };
      if (stopAfterClaim) {
        savedJob = { ...savedJob, revision: savedJob.revision + 1, status: 'cancelled',
          events: [{ command: { id: 'cancel-fixture', action: 'cancel' } }],
          toolAttempts: [{ ...savedJob.toolAttempts[0], state: 'stop_requested', stopRequestedAt: '2026-01-01T00:00:00Z' }] };
        events.push({ kind: 'stop-requested' });
      }
      events.push({ kind: 'execute', name: body.name, args: body.arguments });
      if (responseMismatch === 'revision') jobClaim.jobRevision++;
      if (responseMismatch === 'hash') jobClaim.inputSha256 = 'c'.repeat(64);
      return Response.json({ result: { text: '結果' }, jobClaim });
    }
    if (url.startsWith('/api/sky/agents?id=')) return Response.json({ ownerScope: scope, agent: { ...agent, revision: changedAgent ? 2 : 1 } });
    if (url === '/api/work-jobs') return Response.json({ ownerScope: scope, jobs: [savedJob] });
    if (url === '/api/sky/tool-registry') return Response.json(registry);
    if (url === '/api/rockstar/entitlements') return Response.json({ ...entitlements, ownerScope: changedEntitlementOwner ? 'owner-v1:' + 'd'.repeat(64) : owner });
    if (url === '/api/work-jobs/tool-observations') {
      const body = JSON.parse(options.body); events.push({ kind: body.action, body });
      if (body.action === 'begin') {
        if (beginGate) await beginGate.promise;
        if (beginFailure === 'network') throw new Error('fixture response lost');
        if (beginFailure === 'server') return Response.json({ error: '保存結果不明' }, { status: 503 });
        if (beginFailure === 'malformed') return Response.json({ saved: true });
        savedJob = { ...savedJob, revision: savedJob.revision + 1, toolAttempts: [{ ...body.attempt, state: 'pending' }] };
        if (staleAfterBegin) current = false;
        const operationCapability = beginFailure === 'expired' ? { ...capability, expiresAt: Date.now() - 1 }
          : beginFailure === 'invalid-token' ? { ...capability, token: 'invalid' }
            : beginFailure === 'missing-token' ? undefined : capability;
        return Response.json({ saved: true, job: savedJob, operationCapability });
      }
      const stoppedAfterClaim = savedJob.status === 'cancelled' && savedJob.toolAttempts[0]?.state === 'stop_requested' &&
        savedJob.toolAttempts[0].claimedRevision === body.revision && savedJob.revision === body.revision + 1;
      if (body.revision !== savedJob.revision && !stoppedAfterClaim) return Response.json({ error: '変更済み' }, { status: 409 });
      savedJob = { ...savedJob, revision: savedJob.revision + 1, toolObservations: [{ ...body.observation,
        packageKey, manifestSha256, connectorId: server.id, toolName: 'op', verification: 'client_observed_unverified' }] };
      return Response.json({ job: savedJob });
    }
    throw new Error('unexpected request ' + url);
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  const modules = { react, 'react/jsx-runtime': jsx, 'lucide-react': icons, '@/lib/mcp-hub': mcp,
    '@/lib/mcp-tool-result': { describeMcpToolResult: value => ({ ok: true, text: value.text }) },
    '@/lib/sky-agent-requirements': requirements, '@/lib/sky-tool-package': packageApi,
    '@/lib/sky-package-runtime': runtime, '@/lib/owner-intent': intent, '@/lib/rockstar-service-package-access': access };
  const context = { fetch, Headers, AbortController, AbortSignal, TextEncoder, crypto: { subtle: webcrypto.subtle, randomUUID }, URLSearchParams };
  function load(source) { const exports = {}; runInNewContext(source, { ...context, exports, require: name => { assert.ok(modules[name], name); return modules[name]; } }); return exports; }
  if (realConnector) {
    modules['@/lib/device'] = { DEVICE_URL: 'http://fixture-connector', deviceToken: () => 'fixture-only-token' };
    modules['@/lib/mcp-hub'] = load(hubSource);
  }
  modules['@/components/mcp-bot-runner'] = load(childSource);
  const Parent = load(parentSource).default;
  function render() {
    component = 'parent'; cursor = 0;
    const outer = Parent({ server, toolName: 'op', task: '作業', packageKey, manifestSha256, job: displayedJob, ownerScope: owner,
      agentReference: { id: agent.id, revision: 1 }, isCurrent: () => current, onJob: j => { displayedJob = j; }, onRunningChange: value => { running = value; } });
    function expand(node) {
      if (Array.isArray(node)) return node.map(expand);
      if (!node || typeof node !== 'object') return node;
      if (typeof node.type === 'function') { component = 'child'; cursor = 0; return expand(node.type(node.props)); }
      return { ...node, props: { ...node.props, children: expand(node.props?.children) } };
    }
    tree = expand(outer);
  }
  function nodes(node, out = []) { if (Array.isArray(node)) node.forEach(n => nodes(n, out)); else if (node && typeof node === 'object') { out.push(node); nodes(node.props?.children, out); } return out; }
  const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
  const button = label => nodes(tree).find(n => n.type === 'button' && text(n).includes(label));
  async function waitFor(condition, description) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      render();
      if (condition()) return;
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    assert.fail(`Timed out waiting for ${description}; events: ${events.map(e => e.kind).join(', ')}; UI: ${text(tree)}`);
  }
  async function flush() {
    await waitFor(() => !running && (!events.some(e => e.kind === 'observe') || text(tree).includes('同じ仕事に保存しました')), 'execution and observation to settle');
  }
  async function click(label) {
    const node = button(label); assert.ok(node && !node.props.disabled, label); node.props.onClick(); render();
    if (label === '実行内容を確認') await waitFor(() => Boolean(button('内容を承認して実行')), 'approval');
    else if (beginGate) await waitFor(() => events.some(e => e.kind === 'begin'), 'paused begin');
    else await flush();
  }
  render();
  return { events, click, flush, render, button, waitForBegin: () => waitFor(() => events.some(e => e.kind === 'begin'), 'paused begin'), text: () => text(tree), pauseBegin() { return beginGate = deferred(); },
    failBegin(mode) { beginFailure = mode; }, switchOwner() { scope = 'owner-v1:' + 'c'.repeat(64); }, changeAgent() { changedAgent = true; }, switchEntitlementOwner() { changedEntitlementOwner = true; },
    changeJobRevision() { savedJob = { ...savedJob, revision: savedJob.revision + 1 }; },
    revokeAfterBegin() { staleAfterBegin = true; },
    changeInput(value) { const area = nodes(tree).find(n => n.type === 'textarea' && n.props['aria-label'] === 'MCP toolのJSON引数'); area.props.onChange({ target: { value } }); render(); },
  };
}

void test('explicit approval waits for saved same-job begin and a second fresh check before invoking Tool', async () => {
  const h = harness(); await h.click('実行内容を確認');
  assert.deepEqual(h.events.map(e => e.kind), ['prepare']);
  const gate = h.pauseBegin(); await h.click('内容を承認して実行');
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin']);
  gate.resolve(); await h.flush();
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin', 'connector-request', 'claim', 'execute', 'observe']);
  assert.equal(h.events[1].body.jobId, 'job-fixture'); assert.equal(h.events[1].body.revision, 1);
  const operationGate = h.events.find(e => e.kind === 'connector-request').body.jobGate;
  assert.equal(operationGate.jobId, 'job-fixture'); assert.equal(operationGate.attemptId, h.events[1].body.attempt.id);
  assert.equal(operationGate.agentRevision, 1); assert.match(operationGate.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(h.events.find(e => e.kind === 'claim').digest, h.events[1].body.attempt.inputSha256);
  assert.equal(h.events.find(e => e.kind === 'observe').body.revision, 3);
  assert.match(h.text(), /同じ仕事に保存しました/);
});

void test('changed owner or Agent revision before admission refuses begin and Tool execution', async () => {
  for (const change of ['owner', 'agent', 'entitlement', 'job']) {
    const h = harness(); await h.click('実行内容を確認');
    if (change === 'owner') h.switchOwner(); else if (change === 'agent') h.changeAgent(); else if (change === 'job') h.changeJobRevision(); else h.switchEntitlementOwner();
    await h.click('内容を承認して実行');
    assert.deepEqual(h.events.map(e => e.kind), ['prepare']);
  }
});

void test('failed or uncertain begin never invokes Tool and fences retry', async () => {
  for (const mode of ['server', 'network', 'malformed', 'expired', 'invalid-token', 'missing-token']) {
    const h = harness(); await h.click('実行内容を確認'); h.failBegin(mode); await h.click('内容を承認して実行');
    assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin']);
    assert.equal(h.button('実行内容を確認').props.disabled, true);
  }
});

void test('changed owner after begin prevents Tool dispatch', async () => {
  const h = harness(); await h.click('実行内容を確認'); h.revokeAfterBegin(); await h.click('内容を承認して実行');
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin']);
});

void test('entitlement owner changed during the saved begin is rejected at the second fresh check', async () => {
  const h = harness(); await h.click('実行内容を確認'); const gate = h.pauseBegin();
  await h.click('内容を承認して実行'); h.switchEntitlementOwner(); gate.resolve(); await h.flush();
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin']);
  assert.equal(h.button('実行内容を確認').props.disabled, true);
});

void test('editing arguments revokes approval and duplicate click cannot produce a second begin', async () => {
  const h = harness(); await h.click('実行内容を確認'); h.changeInput('{"text":"changed"}');
  assert.equal(h.button('内容を承認して実行'), undefined);
  await h.click('実行内容を確認'); const gate = h.pauseBegin();
  const button = h.button('内容を承認して実行'); button.props.onClick(); button.props.onClick(); h.render(); await h.waitForBegin();
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'prepare', 'begin']);
  gate.resolve(); await h.flush(); assert.equal(h.events.filter(e => e.kind === 'execute').length, 1);
  assert.equal(h.events.find(e => e.kind === 'execute').args.text, 'changed');
});

void test('a cancellation committed after fresh readback must fence the real connector call', async () => {
  const h = harness({ realConnector: true, cancelBeforeConnector: true });
  await h.click('実行内容を確認'); await h.click('内容を承認して実行');
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin', 'connector-request', 'external-cancel', 'claim'],
    'cancelled job must be rejected by authority before the connector calls the Tool');
  assert.equal(h.events.some(e => e.kind === 'execute'), false);
  assert.match(h.text(), /確認できません|未確認/);
});

void test('claim rejection or lost claim response never invokes Tool and keeps outcome unknown', async () => {
  for (const claimFailure of ['rejected', 'unknown']) {
    const h = harness({ claimFailure }); await h.click('実行内容を確認'); await h.click('内容を承認して実行');
    assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin', 'connector-request', 'claim']);
    assert.equal(h.button('実行内容を確認').props.disabled, true);
    assert.match(h.text(), /確認できません|未確認/);
  }
});

void test('a mismatched claim revision or input hash is never recorded as a successful observation', async () => {
  for (const responseMismatch of ['revision', 'hash']) {
    const h = harness({ responseMismatch }); await h.click('実行内容を確認'); await h.click('内容を承認して実行');
    assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin', 'connector-request', 'claim', 'execute']);
    assert.equal(h.events.some(e => e.kind === 'observe'), false);
    assert.match(h.text(), /確認できません|未確認/);
  }
});

void test('stop arriving after an accepted claim does not claim the actual Tool stopped', async () => {
  const h = harness({ stopAfterClaim: true }); await h.click('実行内容を確認'); await h.click('内容を承認して実行');
  assert.deepEqual(h.events.map(e => e.kind), ['prepare', 'begin', 'connector-request', 'claim', 'stop-requested', 'execute', 'observe']);
  assert.match(h.text(), /同じ仕事に保存しました/);
  assert.match(h.text(), /独立確認されていません/);
});
