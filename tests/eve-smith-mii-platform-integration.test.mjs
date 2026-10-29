import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID, createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { loadRouteFixture } from './route-fixture.mjs';
import * as requestAuth from '../lib/request-auth.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { reviewSkyAgentRequirements } from '../lib/sky-agent-requirements.ts';
import { skyToolPackageKey, skyToolPackageSha256, parseSkyToolPackage } from '../lib/sky-tool-package.ts';
import { createDeclaredFixtureTools, fixturePermissions } from './fixtures/eve-smith-mii-browser/declared-tools.mjs';
import { workToolExecutionReviewDigest } from '../lib/workflow.ts';
import { createConnector } from '../toolkits/sky-mcp-connector/server.mjs';
import { createMiiWorkAdapter } from '../lib/mii-work-adapter.ts';
import { buildSkyOwnerExport } from '../lib/sky-owner-export.ts';

void test('two owner-defined roles use distinct SDK Tool schemas through authenticated jobs, export and mii readback without inference', { timeout: 15000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rock-eve-smith-mii-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql') && !name.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const ownerId = 'local-preview:fixture-owner';
  const modules = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false', ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: ownerId } }],
    ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }],
    ['@/lib/request-auth', requestAuth],
  ]);
  for (const name of ['sky-agent-library', 'sky-agent-requirements', 'bounded-stream', 'owner-intent', 'operations', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
    modules.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  modules.set('@/app/api/work-jobs/tool-observations/authority', loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), modules));
  const agents = loadRouteFixture(new URL('../app/api/sky/agents/route.ts', import.meta.url), modules);
  const jobs = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), modules);
  const observations = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), modules);
  const claims = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), modules);
  let claimRequests = 0;
  const http = createServer(async (request, response) => {
    assert.equal(request.url, '/api/work-jobs/tool-observations/claim'); claimRequests++;
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const input = new Request(`http://127.0.0.1:${http.address().port}${request.url}`, {
      method: request.method, headers: request.headers, body: Buffer.concat(chunks),
    });
    const output = await claims.POST(input); response.writeHead(output.status, { 'Content-Type': 'application/json' }); response.end(await output.text());
  });
  await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => http.close(resolve)));
  const authorityOrigin = `http://127.0.0.1:${http.address().port}`;
  const scope = await ownerScopeFor(ownerId);
  const call = (route, path, method, body, owner = ownerId) => route[method](new Request(`${authorityOrigin}${path}`, {
    method, headers: { Origin: authorityOrigin, 'Content-Type': 'application/json', 'oai-authenticated-user-id': owner,
      ...(method === 'GET' ? {} : { 'X-Rock-Owner-Scope': scope }) }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  }));
  const app = createDeclaredFixtureTools({ localToolDirectory: join(dir, 'discovery'), publicMcpUrl: 'https://example.invalid/mcp',
    skyUrl: 'https://example.invalid', developerToken: 'synthetic-test-token-not-a-credential',
    fetch: async () => { throw new Error('EXTERNAL_NETWORK_FORBIDDEN'); }, logger: { warn() {} } });
  const manifests = app.manifests().map(parseSkyToolPackage);
  assert.equal(manifests.length, 2);
  const packages = await Promise.all(manifests.map(async manifest => ({
    manifest, packageKey: skyToolPackageKey(manifest), manifestSha256: await skyToolPackageSha256(manifest),
    status: 'verified', installable: true,
  })));
  for (const pkg of packages) {
    const now = Date.now();
    sqlite.prepare('INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(pkg.packageKey, pkg.manifest.id, pkg.manifest.version, ownerId, JSON.stringify(pkg.manifest), pkg.manifestSha256, 'verified', now, now);
    sqlite.prepare('INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), pkg.packageKey, pkg.manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', now);
  }
  assert.notEqual(packages[0].packageKey, packages[1].packageKey);
  assert.notDeepEqual(packages[0].manifest.io.inputSchema, packages[1].manifest.io.inputSchema);
  assert.notDeepEqual(packages[0].manifest.io.outputSchema, packages[1].manifest.io.outputSchema);
  const sdk = await app.start(); t.after(() => sdk.close());
  const registryPath = join(dir, 'registry.json'); await writeFile(registryPath, JSON.stringify({ schema: 'rockstaros-mcp-registry/1', servers: [] }));
  const connector = await createConnector({ registryPath, port: 0, localToolDirectory: join(dir, 'discovery'), allowedOrigins: new Set([authorityOrigin]) });
  t.after(() => new Promise(resolve => connector.server.close(resolve)));
  const base = `http://127.0.0.1:${connector.port}`, headers = { Origin: authorityOrigin, Host: `127.0.0.1:${connector.port}`, 'Content-Type': 'application/json' };
  const token = (await (await fetch(`${base}/connect`, { method: 'POST', headers, body: '{}' })).json()).token;
  const mcpRequests = [];
  const mcp = (path, method, value) => {
    mcpRequests.push({ path, method });
    return fetch(`${base}${path}`, { method, headers: { ...headers, Authorization: `Bearer ${token}` }, ...(value ? { body: JSON.stringify(value) } : {}) });
  };
  await mcp('/servers', 'GET'); assert.equal((await mcp(`/servers/${sdk.localId}/connect`, 'POST', {})).status, 200);
  const servers = (await (await mcp('/servers', 'GET')).json()).servers;
  const unsupportedId = randomUUID(), unsupportedPurpose = '入力した画像を識別して保存したい';
  const unsupportedRequirements = { inputFields: ['image'], outputFields: ['identifiedObject'], packageKey: packages[0].packageKey, executionTarget: 'pc' };
  const unsupportedCreated = await call(agents, '/api/sky/agents', 'PUT', { id: unsupportedId, revision: 0, create: true,
    settings: { ...defaultSkyAgentSettings('画像の担当', unsupportedPurpose), requirements: unsupportedRequirements } });
  assert.equal(unsupportedCreated.status, 200);
  const unsupportedRead = await call(agents, `/api/sky/agents?id=${unsupportedId}`, 'GET');
  assert.equal(unsupportedRead.status, 200);
  const unsupported = (await unsupportedRead.json()).agent;
  assert.equal(unsupported.id, unsupportedId); assert.equal(unsupported.instructions, unsupportedPurpose);
  assert.deepEqual(unsupported.requirements, unsupportedRequirements);
  const rejected = reviewSkyAgentRequirements(unsupported.requirements, packages, servers);
  assert.equal(rejected.state, 'missing'); assert.deepEqual(rejected.candidates, []);
  assert.ok(rejected.issues.some(issue => issue.includes('image')));
  assert.ok(rejected.issues.some(issue => issue.includes('identifiedObject')));
  assert.equal(mcpRequests.filter(request => /\/(prepare|execute)$/.test(request.path)).length, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
  const scenarios = [
    { name: '資料担当', purpose: '資料の行数を数えて記録する', package: packages[0], toolName: 'count_lines',
      inputFields: ['text'], outputFields: ['lines'], args: { text: 'alpha\nbeta' }, expected: { lines: 2 } },
    { name: '合計担当', purpose: '二つの整数を合計して記録する', package: packages[1], toolName: 'add_integers',
      inputFields: ['left', 'right'], outputFields: ['sum'], args: { left: 4, right: 7 }, expected: { sum: 11 } },
  ];
  for (const { name, purpose, package: pkg, toolName, inputFields, outputFields, args, expected } of scenarios) {
    const { packageKey, manifestSha256 } = pkg;
    const requirements = { inputFields, outputFields, packageKey, executionTarget: 'pc',contract:{schema:'rockstaros.agent-tool-expectation/1',inputTypes:toolName==='count_lines'?{text:'string'}:{left:'integer',right:'integer'},outputTypes:toolName==='count_lines'?{lines:'integer'}:{sum:'integer'},capabilityIds:[toolName==='count_lines'?'example.count-lines':'example.add-integers'],allowedPermissions:fixturePermissions,runtime:{serverId:sdk.localId,toolName}} };
    const review = reviewSkyAgentRequirements(requirements, packages, servers);
    assert.equal(review.state, 'candidate');
    assert.deepEqual(review.candidates.map(candidate => candidate.toolName), [toolName]);
    const missing = reviewSkyAgentRequirements({ ...requirements, outputFields: ['unavailable'] }, packages, servers);
    assert.equal(missing.state, 'missing'); assert.deepEqual(missing.candidates, []);
    // The production review returns no runnable candidate. No prepare/execute is
    // sent for those unfulfilled requirements.
    const agentId = randomUUID();
    const createAgent = await call(agents, '/api/sky/agents', 'PUT', { id: agentId, revision: 0, create: true,
      settings: { ...defaultSkyAgentSettings(name, purpose), requirements } });
    assert.equal(createAgent.status, 200); const agent = (await createAgent.json()).agent;
    const jobId = randomUUID();
    const created = await call(jobs, '/api/work-jobs', 'POST', { id: jobId, title: purpose, templateId: 'cloud-agent',
      agentRef: { id: agent.id, revision: agent.revision } });
    assert.equal(created.status, 201); let job = (await created.json()).job;
    assert.equal(job.agentBinding.agentId, agentId);
    const prepared = await (await mcp(`/servers/${sdk.localId}/prepare`, 'POST', { name: toolName, arguments: args })).json();
    const attempt = { id: randomUUID(), packageKey, manifestSha256, connectorId: sdk.localId,
      toolName, inputSha256: createHash('sha256').update(JSON.stringify(args)).digest('hex'),
      executionReview:{schema:'rockstaros.work-tool-execution-review/1',ownerScope:scope,jobId,jobRevision:job.revision,agentId,agentRevision:agent.revision,
        packageKey,manifestSha256,packagePricing:{model:'free',note:pkg.manifest.pricing.note,declaration:'provider_unverified'},approvalContext:prepared.executionContext} };
    const begun = await call(observations, '/api/work-jobs/tool-observations', 'POST', { action: 'begin', jobId, revision: job.revision, attempt });
    assert.equal(begun.status, 200); const beginBody = await begun.json(); assert.equal(beginBody.saved, true); job = beginBody.job;
    const executed = await mcp(`/servers/${sdk.localId}/execute`, 'POST', { name: toolName, arguments: args,
      approvalToken: prepared.approvalToken, confirmed: true, jobGate: { jobId, attemptId: attempt.id, agentId,
        agentRevision: agent.revision, ownerScope: scope, token: beginBody.operationCapability.token, executionReviewDigest:await workToolExecutionReviewDigest(attempt.executionReview) } });
    assert.equal(executed.status, 200); const execution = await executed.json();
    assert.equal(execution.jobClaim.attemptId, attempt.id); assert.equal(execution.jobClaim.inputSha256, attempt.inputSha256);
    job = { ...job, revision: execution.jobClaim.jobRevision }; const structured = execution.result.structuredContent;
    assert.deepEqual(structured, expected); const result = JSON.stringify(structured);
    const observed = await call(observations, '/api/work-jobs/tool-observations', 'POST', { action: 'observe', jobId, revision: job.revision,
      attemptId: attempt.id, observation: { id: randomUUID(), text: result } });
    assert.equal(observed.status, 200); job = (await observed.json()).job;
    assert.equal(job.toolObservations[0].text, result); assert.equal(job.toolObservations[0].verification, 'client_observed_unverified');
    const retry = await call(observations, '/api/work-jobs/tool-observations', 'POST', { action: 'begin', jobId, revision: job.revision,
      attempt: { ...attempt, id: randomUUID() } });
    assert.equal(retry.status, 409); // observed is still not a verified external terminal state
    const adapter = createMiiWorkAdapter({ now: () => 1000, fetchImpl: async (path, init) => call(jobs, path, init.method, init.body && JSON.parse(init.body)) });
    adapter.observe({ bootId: 'synthetic-mii', placeEpoch: 1, sequence: 1, sceneRevision: 1, observedAt: 1000, expiresAt: 2000, attached: true, tracking: 'tracked' });
    const ref = { jobId, ownerScope: scope, revision: job.revision, sceneRevision: 1, agentId, agentRevision: agent.revision };
    const readback = await adapter.readExisting(ref);
    assert.equal(readback.agentBinding, 'verified'); assert.equal(readback.job.toolObservations[0].text, result);
    const originalResultHash = createHash('sha256').update(result, 'utf8').digest('hex');
    adapter.disconnect(); adapter.observe({ bootId: 'synthetic-mii', placeEpoch: 2, sequence: 2, sceneRevision: 1, observedAt: 1000, expiresAt: 2000, attached: true, tracking: 'tracked' });
    const reconnected = await adapter.readExisting(ref);
    assert.equal(reconnected.job.id, jobId);
    assert.equal(createHash('sha256').update(reconnected.job.toolObservations[0].text, 'utf8').digest('hex'), originalResultHash);
    adapter.close();
    const exported = await buildSkyOwnerExport({ job, agents: [], cloud: [], budget: null, reservations: [] });
    assert.ok(exported.manifest.files.some(file => file.name === 'tool-observations.json'));
    const start = exported.html.indexOf('<pre data-export-file="tool-observations.json">');
    assert.ok(start >= 0);
    const rest = exported.html.slice(start + '<pre data-export-file="tool-observations.json">'.length);
    const raw = rest.slice(0, rest.indexOf('</pre>')).replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
    const exportedObservation = JSON.parse(raw)[0];
    const manifestEntry = exported.manifest.files.find(file => file.name === 'tool-observations.json');
    assert.equal(exportedObservation.text, result);
    assert.equal(createHash('sha256').update(exportedObservation.text, 'utf8').digest('hex'), originalResultHash);
    assert.equal(createHash('sha256').update(raw, 'utf8').digest('hex'), manifestEntry.sha256);
    assert.equal(Buffer.byteLength(raw, 'utf8'), manifestEntry.byteLength);

    assert.ok(exported.html.includes(result.replaceAll('"', '&quot;')));
    const denied = await call(jobs, '/api/work-jobs', 'GET', undefined, 'another-owner');
    assert.equal((await denied.json()).jobs.some(row => row.id === jobId), false);
  }
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 2);
  assert.equal(claimRequests, 2);
});
