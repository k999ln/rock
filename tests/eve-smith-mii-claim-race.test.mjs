import * as postCommunityAccess from '../lib/community-access.ts';
import * as postSkySocial from '../lib/sky-social.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRouteFixture } from './route-fixture.mjs';
import * as requestAuth from '../lib/request-auth.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { parseSkyToolPackage, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { createSkyToolApp } from '../toolkits/sky-tool-sdk/src/index.mjs';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

async function fixture(t, { blockTool = false, loseClaimResponse = false } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'rock-claim-race-'));
  const sqlite = new DatabaseSync(':memory:');
  const entered = deferred(), release = deferred();
  let handlerCalls = 0, claimCalls = 0;
  t.after(() => { release.resolve(); sqlite.close(); return rm(dir, { recursive: true, force: true }); });
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql') && !name.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const owner = 'local-preview:claim-race-fixture', scope = await ownerScopeFor(owner);
  const env = { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: owner, ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' };
  const deps = new Map([['@/lib/community-access',postCommunityAccess],['@/lib/sky-social',postSkySocial],['cloudflare:workers', { env }], ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }]]);
  for (const name of ['sky-agent-requirements', 'request-auth', 'bounded-stream', 'owner-intent', 'operations', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
    deps.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const authority = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), deps);
  deps.set('@/app/api/work-jobs/tool-observations/authority', authority);
  const routes = {
    '/api/sky/agents': loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), deps),
    '/api/work-jobs': loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), deps),
    '/api/work-jobs/tool-observations': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), deps),
    '/api/work-jobs/tool-observations/claim': loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), deps),
  };
  const web = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`), chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks), headers = new Headers(req.headers);
      // Only the fixture's own synthetic local user; no real browser/session.
      if (!url.pathname.endsWith('/claim')) headers.set('oai-authenticated-user-id', owner);
      const response = await routes[url.pathname][req.method](new Request(url, { method: req.method, headers, ...(body.length ? { body } : {}) }));
      if (url.pathname.endsWith('/claim')) {
        claimCalls++;
        if (loseClaimResponse && response.ok) { res.destroy(); return; }
      }
      res.writeHead(response.status, { 'Content-Type': 'application/json' }); res.end(await response.text());
    } catch (error) { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise((resolve, reject) => { web.once('error', reject); web.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { web.close(resolve); web.closeAllConnections(); }));
  const origin = `http://127.0.0.1:${web.address().port}`;
  const app = createSkyToolApp({ developer: { id: 'fixture-author', name: 'Fixture', supportUrl: 'https://example.invalid/support' },
    app: { id: 'dev.fixture.counter', name: 'Fixture Counter', version: '1.0.0', sourceUrl: 'https://example.invalid/source',
      license: 'MIT', publicMcpUrl: 'https://example.invalid/mcp' },
    registration: false, autoPublish: false, localToolDirectory: join(dir, 'discovery'), skyUrl: 'https://example.invalid',
    developerToken: 'fixture-token-not-a-credential', fetch: async () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); }, logger: { warn() {} } });
  app.tool({ name: 'count_lines', title: '行数', description: '合成入力の文章を受け取り、行数だけを数える決定的なテスト処理です。', useWhen: ['合成文章'], doNotUseWhen: ['外部送信'],
    inputSchema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', additionalProperties: false, required: ['lines'], properties: { lines: { type: 'integer' } } },
    sideEffects: ['none'], price: { model: 'free', note: '合成Tool' }, handler: async ({ text }) => {
      handlerCalls++; entered.resolve(); if (blockTool) await release.promise; return { lines: text.split('\n').length };
    } });
  const manifest = parseSkyToolPackage(app.manifests()[0]), packageKey = skyToolPackageKey(manifest), manifestSha256 = await skyToolPackageSha256(manifest);
  sqlite.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(packageKey, manifest.id, manifest.version, 'fixture-author', JSON.stringify(manifest), manifestSha256, 'verified', Date.now(), Date.now(), Date.now());
  sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), packageKey, manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', Date.now(), null);
  const sdk = await app.start(); t.after(() => { sdk.server.closeAllConnections(); return sdk.close(); });
  const registryPath = join(dir, 'registry.json'); await writeFile(registryPath, JSON.stringify({ schema: 'rockstaros-mcp-registry/1', servers: [] }));
  const connector = await createConnector({ registryPath, port: 0, localToolDirectory: join(dir, 'discovery'), allowedOrigins: new Set([origin]) });
  t.after(() => new Promise(resolve => { connector.server.close(resolve); connector.server.closeAllConnections(); }));
  const connectorOrigin = `http://127.0.0.1:${connector.port}`;
  const headers = { Origin: origin, Host: `127.0.0.1:${connector.port}`, 'Content-Type': 'application/json' };
  const token = (await (await fetch(`${connectorOrigin}/connect`, { method: 'POST', headers, body: '{}' })).json()).token;
  const mcp = (path, method, value) => fetch(`${connectorOrigin}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}` }, ...(value ? { body: JSON.stringify(value) } : {}) });
  await mcp('/servers', 'GET'); assert.equal((await mcp(`/servers/${sdk.localId}/connect`, 'POST', {})).status, 200);
  const call = (path, method, value) => fetch(`${origin}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': scope }, ...(value ? { body: JSON.stringify(value) } : {}) });
  const requirements = { inputFields: ['text'], outputFields: ['lines'], packageKey, executionTarget: 'pc' };
  const agentId = randomUUID(), saved = await call('/api/sky/agents', 'PUT', { id: agentId, revision: 0, create: true,
    settings: { ...defaultSkyAgentSettings('合成担当', '合成データの行数'), requirements } });
  assert.equal(saved.status, 200); const agent = (await saved.json()).agent;
  const jobId = randomUUID(), created = await call('/api/work-jobs', 'POST', { id: jobId, title: '同じ合成仕事', templateId: 'article', agentRef: { id: agentId, revision: agent.revision } });
  assert.equal(created.status, 201); const job = (await created.json()).job;
  const args = { text: 'one\ntwo' }, prepared = await (await mcp(`/servers/${sdk.localId}/prepare`, 'POST', { name: 'count_lines', arguments: args })).json();
  const attempt = { id: randomUUID(), packageKey, manifestSha256, connectorId: sdk.localId,
    toolName: 'count_lines', inputSha256: createHash('sha256').update(JSON.stringify(args)).digest('hex') };
  const start = await call('/api/work-jobs/tool-observations', 'POST', { action: 'begin', jobId, revision: job.revision, attempt });
  assert.equal(start.status, 200); const begun = await start.json(); assert.equal(begun.saved, true);
  const jobGate = { jobId, attemptId: attempt.id, agentId, agentRevision: agent.revision, ownerScope: scope, token: begun.operationCapability.token };
  const execute = (approvalToken = prepared.approvalToken) => mcp(`/servers/${sdk.localId}/execute`, 'POST', { name: 'count_lines', arguments: args, approvalToken, confirmed: true, jobGate });
  const prepareAgain = async () => (await (await mcp(`/servers/${sdk.localId}/prepare`, 'POST', { name: 'count_lines', arguments: args })).json()).approvalToken;
  const cancel = () => call('/api/work-jobs', 'PATCH', { jobId, revision: begun.job.revision, command: { id: randomUUID(), action: 'cancel' } });
  const read = async () => (await (await call('/api/work-jobs', 'GET')).json()).jobs.find(row => row.id === jobId);
  return { execute, prepareAgain, cancel, read, call, jobId, attempt, begun, entered: entered.promise, release: release.resolve,
    get handlerCalls() { return handlerCalls; }, get claimCalls() { return claimCalls; } };
}

void test('cancel wins: actual Connector claim is rejected and real SDK handler is never invoked', { timeout: 15000 }, async t => {
  const f = await fixture(t); const cancelled = await f.cancel(); assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).job.toolAttempts[0].state, 'cancelled_before_claim');
  const result = await f.execute(); assert.equal(result.status, 409); assert.equal(f.claimCalls, 1); assert.equal(f.handlerCalls, 0);
  const job = await f.read(); assert.equal(job.status, 'cancelled'); assert.equal(job.toolObservations?.length ?? 0, 0);
});

void test('claim wins: cancellation is stop requested, result can be retained without asserting remote stopped', { timeout: 15000 }, async t => {
  const f = await fixture(t, { blockTool: true }); const executing = f.execute(); await f.entered;
  const cancelled = await f.cancel(); assert.equal(cancelled.status, 200); const cancelledJob = (await cancelled.json()).job;
  assert.equal(cancelledJob.toolAttempts[0].state, 'stop_requested'); assert.ok(cancelledJob.toolAttempts[0].stopRequestedAt);
  f.release(); const response = await executing; assert.equal(response.status, 200); const output = await response.json();
  assert.deepEqual(output.result.structuredContent, { lines: 2 }); assert.equal(f.handlerCalls, 1);
  const observation = { id: randomUUID(), text: JSON.stringify(output.result.structuredContent) };
  const observed = await f.call('/api/work-jobs/tool-observations', 'POST', { action: 'observe', jobId: f.jobId,
    revision: output.jobClaim.jobRevision, attemptId: f.attempt.id, observation });
  assert.equal(observed.status, 200, 'one intervening stop request must not discard a returned result');
  const final = await f.read(); assert.equal(final.status, 'cancelled'); assert.equal(final.toolObservations[0].text, observation.text);
  assert.equal(final.toolObservations[0].verification, 'client_observed_unverified'); assert.ok(final.toolAttempts[0].stopRequestedAt);
});

void test('lost claim response: real claim commits but Connector does not call Tool or allow resend', { timeout: 15000 }, async t => {
  const f = await fixture(t, { loseClaimResponse: true }); const first = await f.execute();
  assert.equal(first.status, 409); assert.equal(f.claimCalls, 1); assert.equal(f.handlerCalls, 0);
  const job = await f.read(); assert.equal(job.toolAttempts[0].state, 'claimed');
  const retry = await f.execute(); assert.equal(retry.status, 403); assert.equal(f.claimCalls, 1); assert.equal(f.handlerCalls, 0);
  const newApproval = await f.prepareAgain(); const differentApprovalRetry = await f.execute(newApproval);
  assert.equal(differentApprovalRetry.status, 409); assert.equal(f.claimCalls, 2); assert.equal(f.handlerCalls, 0);
  const cancelled = await f.cancel(); assert.equal(cancelled.status, 200);
  assert.equal((await cancelled.json()).job.toolAttempts[0].state, 'stop_requested');
});
