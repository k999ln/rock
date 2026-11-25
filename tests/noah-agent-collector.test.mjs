import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectAgents, runCollector, collectorArguments } from '../scripts/noah-agent-collector.mjs';
import { openCollectorStore, readCollectorStatus, COLLECTOR_LEASE_MS } from '../scripts/noah-collector-store.mjs';
import { collectorServicePlist } from '../scripts/noah-collector-service.mjs';
import { collectorLookup, collectorPublicAddress, createCollectorNetwork } from '../scripts/noah-collector-network.mjs';
import { noahIntakeImportParts, parseNoahIntakeImportPart, createIntakeImportApi } from '../lib/noah-intake-import.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { splitNoahIntakeImport, NOAH_INTAKE_IMPORT_LIMITS } from '../lib/noah-intake-import-parts.ts';
import { entry, page, NOW, fixture } from './fixtures/noah/intake.mjs';
import { mcpServer } from './fixtures/noah/mcp-server.mjs';

const budget = { pages: 1, probes: 8, concurrent: 4, seconds: 25 };
const github = { id: 1, full_name: 'maker/agent', name: 'Agent', private: false, fork: false, archived: false, default_branch: 'main', topics: ['ai-agent'] };
const hf = { _id: 'a'.repeat(24), id: 'maker/agent', private: false, sha: 'b'.repeat(40), sdk: 'gradio', tags: ['agent'] };
function directory(t) { const dir = mkdtempSync(join(tmpdir(), 'noah-collector-test-')); t.after(() => rmSync(dir, { recursive: true, force: true })); return dir; }
function world(registry = async () => page([entry(1)])) {
  const server = mcpServer(), calls = [];
  return { server, calls, fetch: async (raw, init) => {
    const url = new URL(raw); calls.push(url);
    if (url.hostname === 'registry.modelcontextprotocol.io') return registry(url, init);
    if (url.pathname === '/repos/sandbox-quantum/switch/releases/latest') return Response.json({
      tag_name: 'stable', published_at: new Date(NOW - 8 * 86_400_000).toISOString(), draft: false, prerelease: false,
      html_url: 'https://github.com/sandbox-quantum/switch/releases/tag/stable',
    });
    if (url.hostname === 'api.github.com') return Response.json(url.pathname.includes('/search/') ? { items: [github] } : url.pathname.includes('/git/ref/') ? { object: { sha: 'b'.repeat(40) } } : github);
    if (url.hostname === 'huggingface.co') return Response.json(url.pathname === '/api/spaces' ? [hf] : hf);
    return server.fetch(raw, init);
  } };
}

void test('three sources are collected separately; only checked MCP exports reach the existing import API', async t => {
  const dir = directory(t), net = world();
  const state = await runCollector({ directory: dir, fetcher: net.fetch, now: () => NOW, budget });
  assert.equal(state.state, 'ready');
  assert.equal(state.counts.registry, 1); assert.equal(state.counts.handshake, 1); assert.equal(state.export.families, 1);
  assert.deepEqual(state.counts.discovery.map(r => [r.provider, r.total]), [['github', 1], ['huggingface', 1]]);
  assert.ok(net.server.log.length > 0); assert.ok(net.server.log.every(r => r.rpc !== 'tools/call'));
  const all = JSON.parse(readFileSync(join(dir, 'import.json')));
  const discovery = JSON.parse(readFileSync(join(dir, 'discovery.json')));
  assert.ok(discovery.candidates.every(c => c.verified === false));
  const prod = fixture(t), api = createIntakeImportApi({ db: prod.db, now: () => NOW, reviewers: ['reviewer'], authenticate: async () => 'reviewer' });
  for (const part of noahIntakeImportParts(all)) {
    parseNoahIntakeImportPart(part);
    const response = await api(new Request('https://avoado.si/api/noah/intake/import', { method: 'POST', headers: { Origin: 'https://avoado.si', 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor('reviewer') }, body: JSON.stringify(part) }));
    assert.equal(response.status, 200, JSON.stringify(await response.json()));
  }
  assert.equal((await prod.store.list(null, new URLSearchParams())).items.length, 1);
  assert.equal(readCollectorStatus(dir, NOW).running, false);
});

void test('restart resumes cursor, retains candidates and does not repeat discovery or recent handshakes', async t => {
  const dir = directory(t), cursors = [];
  const net = world(async url => { cursors.push(url.searchParams.get('cursor')); return url.searchParams.has('cursor') ? page([entry(2)]) : page([entry(1)], 'page-2'); });
  await runCollector({ directory: dir, fetcher: net.fetch, now: () => NOW, budget });
  const before = net.calls.filter(u => u.hostname === 'api.github.com').length;
  const state = await runCollector({ directory: dir, fetcher: net.fetch, now: () => NOW + 60_000, budget });
  assert.deepEqual(cursors, [null, 'page-2']); assert.equal(state.counts.registry, 2);
  assert.equal(net.calls.filter(u => u.hostname === 'api.github.com').length, before);
  assert.equal(net.server.log.filter(r => r.rpc === 'initialize').length, 2);
});

void test('rate limits preserve progress and retry deadlines across restarts without busy polling', async t => {
  const dir = directory(t); let calls = 0;
  const net = world(async () => { calls++; return new Response(null, { status: 429, headers: { 'retry-after': '600' } }); });
  const first = await runCollector({ directory: dir, fetcher: net.fetch, now: () => NOW, budget });
  assert.deepEqual(first.errors, [{ source: 'mcp-registry', code: 'rate_limited' }]);
  assert.equal(first.counts.discovery.length, 2);
  await runCollector({ directory: dir, fetcher: net.fetch, now: () => NOW + 60_000, budget });
  assert.equal(calls, 1);
});

void test('an active collector is exclusive; expired owners are fenced and cannot release a new owner', t => {
  const dir = directory(t); let clock = NOW;
  const first = openCollectorStore(dir, { now: () => clock });
  assert.throws(() => openCollectorStore(dir, { now: () => clock }), /already_running/);
  clock += COLLECTOR_LEASE_MS + 1;
  const second = openCollectorStore(dir, { now: () => clock });
  assert.throws(() => first.renew(), /lease_lost/);
  first.close(); second.assertLease(); second.close();
});

void test('watch waits between passes and aborting the wait releases the database', async t => {
  const dir = directory(t), net = world(), controller = new AbortController(); let waits = 0;
  await runCollector({ directory: dir, watch: true, signal: controller.signal, fetcher: net.fetch, now: () => NOW, budget,
    wait: async milliseconds => { assert.equal(milliseconds, 60_000); waits++; controller.abort(); },
    onStatus: () => assert.equal(readCollectorStatus(dir, NOW).running, true),
  });
  assert.equal(waits, 1); assert.equal(readCollectorStatus(dir, NOW).running, false);
  const local = openCollectorStore(dir, { now: () => NOW }); local.close();
});

void test('a broken source does not prevent registry collection or overwrite a valid export with partial JSON', async t => {
  const dir = directory(t), net = world();
  const local = openCollectorStore(dir, { now: () => NOW }); t.after(() => local.close());
  const state = await collectAgents({ local, directory: dir, now: () => NOW, budget, fetcher: (url, init) => new URL(String(url)).hostname === 'api.github.com' ? Promise.reject(Error('private error text')) : net.fetch(url, init) });
  assert.equal(state.state, 'degraded'); assert.equal(state.export.families, 1);
  assert.equal(state.errors[0].source, 'github');
  assert.ok(!readFileSync(join(dir, 'status.json'), 'utf8').includes('private error text'));
  assert.equal(JSON.parse(readFileSync(join(dir, 'import.json'))).families.length, 1);
});

void test('socket lookup returns only the checked public answers and rejects mixed/private/mapped DNS', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '::1', '::ffff:7f00:1', '::ffff:127.0.0.1', 'fd00::1', '2002:7f00:1::', 'not-an-ip']) assert.equal(collectorPublicAddress(address), false, address);
  assert.equal(collectorPublicAddress('1.1.1.1'), true);
  const run = (addresses, options = { all: true }) => new Promise((resolve, reject) => collectorLookup(async () => addresses)('agent.example.com', options, (error, address, family) => error ? reject(error) : resolve({ address, family })));
  const publicDns = [{ address: '1.1.1.1', family: 4 }];
  assert.deepEqual((await run(publicDns)).address, publicDns);
  assert.deepEqual(await run(publicDns, { family: 4 }), { address: '1.1.1.1', family: 4 });
  await assert.rejects(run([...publicDns, { address: '127.0.0.1', family: 4 }]), /blocked/);
  await assert.rejects(run([]), /blocked/);
  const net = createCollectorNetwork();
  try { await assert.rejects(net.fetch('https://127.0.0.1/private')); await assert.rejects(net.fetch('http://agent.example.com')); }
  finally { await net.close(); }
});

void test('CLI rejects unknown or conflicting options before opening a database', () => {
  assert.throws(() => collectorArguments(['--watch', '--once']), /choose_/);
  assert.throws(() => collectorArguments(['--unexpected']));
  assert.equal(collectorArguments([]).watch, false);
});

void test('large collection imports respect UTF-8 byte limits and preserve every member', () => {
  const all = { schema: 'noah-intake-import/1', exportedAt: NOW, families: [], candidates: [], checks: [] };
  for (let i = 0; i < 12; i++) {
    all.families.push({ id: `family-${i}`, representative_id: `candidate-${i}` });
    all.candidates.push({ id: `candidate-${i}`, family_id: `family-${i}`, record_json: 'あ'.repeat(30_000) });
    all.checks.push({ candidate_id: `candidate-${i}` });
  }
  const parts = splitNoahIntakeImport(all);
  assert.ok(parts.length > 1);
  assert.ok(parts.every(p => Buffer.byteLength(JSON.stringify(p)) <= NOAH_INTAKE_IMPORT_LIMITS.bytes));
  assert.deepEqual(parts.flatMap(p => p.candidates), all.candidates);
  const oversized = { ...all, families: [all.families[0]], candidates: Array.from({ length: 241 }, (_, i) => ({ id: `member-${i}`, family_id: 'family-0' })), checks: [] };
  assert.throws(() => splitNoahIntakeImport(oversized), /上限/);
});

void test('background service restarts and loads secrets from a private env file rather than plist arguments', () => {
  const plist = collectorServicePlist({ node: '/node', script: '/repo/collector.mjs', directory: '/data', envFile: '/private/runtime.env', origin: 'https://avoado.si' });
  assert.match(plist, /<key>KeepAlive<\/key><true\/>/);
  assert.match(plist, /--env-file=\/private\/runtime.env/);
  assert.match(plist, /--watch/); assert.match(plist, /--publish/);
  assert.ok(!plist.includes('NOAH_COLLECTION_KEY='));
});
