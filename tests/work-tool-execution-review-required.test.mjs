import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRouteFixture } from './route-fixture.mjs';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import * as auth from '../lib/request-auth.ts';
import { createSkyToolPackageDraft, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { workToolCapabilityHash, workToolExecutionReviewDigest, storedWorkToolExecutionReview } from '../lib/workflow.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';

async function setup(t, persistent = false, authorityAvailable = true, reviewExpiresAt = null) {
  const dir = persistent ? mkdtempSync(join(tmpdir(), 'work-attempt-test-')) : null;
  const dbPath = dir ? join(dir, 'fixture.sqlite') : ':memory:';
  const sqlite = new DatabaseSync(dbPath); t.after(() => { sqlite.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, afterRun: null, prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { db.beforeRun?.(sql, args); const changes = Number(sqlite.prepare(sql).run(...args).changes); db.afterRun?.(sql, args); return { meta: { changes } }; },
  }; } }; } };
  const ownerId = authorityAvailable === 'real' ? 'local-preview:fixture' : 'alice';
  const baseOrigin = authorityAvailable === 'real' ? 'http://localhost:3000' : 'https://fixture.invalid';
  const config = { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID: ownerId, ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' };
  const realGate = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts', import.meta.url), new Map([['cloudflare:workers', { env: config }], ['@/lib/request-auth', auth]]));
  const dependencies = new Map([
    ['@/app/api/work-jobs/tool-observations/authority', authorityAvailable === 'real' ? realGate : { dispatchAuthorityAvailable: () => authorityAvailable }],
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: auth.requestUser }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const work = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const routeRoot = new URL('../app/api/work-jobs/tool-observations/', import.meta.url);
  const observations = loadRouteFixture(new URL('route.ts', routeRoot), dependencies);
  const claims = loadRouteFixture(new URL('claim/route.ts', routeRoot), dependencies);
  async function call(route, method, payload, { owner = ownerId, scope, origin = baseOrigin } = {}) {
    const response = await route[method](new Request(`${baseOrigin}/api/work-jobs${route === observations ? '/tool-observations' : route === claims ? '/tool-observations/claim' : ''}`, {
      method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(owner ? { 'oai-authenticated-user-id': owner } : {}),
        ...(scope === undefined ? {} : { 'X-Rock-Owner-Scope': scope }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    }));
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, body: await response.json() };
  }
  const role = await skyAgentLibraryStore(db, ownerId).save(randomUUID(), 0, { ...defaultSkyAgentSettings('独立fixture担当', '本人入力'), requirements: { inputFields: [], outputFields: [], packageKey: 'dev.fixture.counter@1.0.0', executionTarget: 'pc' } }, true);
  const created = await call(work, 'POST', { id: randomUUID(), title: '保存済みの同じ仕事', templateId: 'article',
    agentRef: { id: role.id, revision: role.revision } });
  assert.equal(created.status, 201);
  const scope = (await call(work, 'GET')).body.ownerScope;
  const manifest = createSkyToolPackageDraft({ sourceKind: 'github', sourceUrl: 'https://github.com/fixture/counter', developerName: 'Fixture', developerId: 'fixture', license: 'MIT', version: '1.0.0' });
  const manifestSha256 = await skyToolPackageSha256(manifest);
  const inputSchemaSha256 = await skyPackageSchemaSha256(manifest.io.inputSchema);
  const outputSchemaSha256 = await skyPackageSchemaSha256(manifest.io.outputSchema);
  // Test-only verified registry row and review; this is not a production trust assertion.
  sqlite.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at,published_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run('dev.fixture.counter@1.0.0', 'dev.fixture.counter', '1.0.0', 'fixture-author', JSON.stringify(manifest), manifestSha256, 'verified', Date.now(), Date.now(), Date.now());
  sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), 'dev.fixture.counter@1.0.0', manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', Date.now(), reviewExpiresAt);
  const attempt = () => ({ id: randomUUID(), packageKey: 'dev.fixture.counter@1.0.0', manifestSha256,
    connectorId: 'fixture-connector', toolName: 'count', inputSha256: 'b'.repeat(64) });
  const result = () => ({ id: randomUUID(), text: '合成した結果: 3' });
  const begin = (jobId, revision, value, opts = {}) => call(observations, 'POST', { action: 'begin', jobId, revision, attempt: value }, { scope, ...opts });
  const observe = (jobId, revision, attemptId, value, opts = {}) => call(observations, 'POST',
    { action: 'observe', jobId, revision, attemptId, observation: value }, { scope, ...opts });
  const claim = (jobId, spec, capability, patch = {}) => call(claims, 'POST', {
    jobId, attemptId: spec.id, agentId: role.id, agentRevision: role.revision, ownerScope: scope,
    inputSha256: spec.inputSha256, connectorId: spec.connectorId, toolName: spec.toolName, token: capability.token, inputSchemaSha256, outputSchemaSha256, transport: 'stdio', ...patch,
  });
  return { sqlite, db, dbPath, call, work, observations, claims, role, job: created.body.job, scope, attempt, result, begin, observe, claim };
}


// An independent actual-POST fixture: do not emulate creation by assigning a
// binding to an old job. The only injected case below represents an already
// persisted legacy pending operation from before the server upgrade.
async function reviewedJob(t) {
  const f = await setup(t), spec = f.attempt(), input = { text:'creation input' };
  const manifest = JSON.parse(f.sqlite.prepare('SELECT manifest FROM sky_tool_packages LIMIT 1').get().manifest);
  const creationReview = { schema:'rockstaros.work-agent-creation-review/1', ownerScope:f.scope,
    agentId:f.role.id,agentRevision:f.role.revision,packageKey:spec.packageKey,manifestSha256:spec.manifestSha256,
    serverId:spec.connectorId,toolName:spec.toolName,transport:'stdio',toolDigest:'d'.repeat(64),
    inputSha256:createHash('sha256').update(JSON.stringify(input)).digest('hex'),
    pricing:{model:'free',packageNote:manifest.pricing.note,runtimeNote:'fixture',declaration:'provider_unverified'} };
  const created = await f.call(f.work,'POST',{id:randomUUID(),title:'actual creation-reviewed job',templateId:'article',
    agentRef:{id:f.role.id,revision:f.role.revision},creationReview,creationInput:input,creationReviewExpiresAt:Date.now()+29_000},{scope:f.scope});
  assert.equal(created.status,201,JSON.stringify(created.body));
  assert.deepEqual(created.body.job.agentBinding.creationReview,creationReview);
  return { ...f, legacyJob:f.job, job:created.body.job, creationReview, manifest };
}
function reviewed(f) {
  const spec=f.attempt();
  spec.executionReview={schema:'rockstaros.work-tool-execution-review/1',ownerScope:f.scope,jobId:f.job.id,
    jobRevision:0,agentId:f.role.id,agentRevision:f.role.revision,packageKey:spec.packageKey,manifestSha256:spec.manifestSha256,
    packagePricing:{model:'free',note:f.manifest.pricing.note,declaration:'provider_unverified'},
    approvalContext:{schema:'rockstaros.mcp-approval-context/1',connectorId:spec.connectorId,toolName:spec.toolName,
      transport:'stdio',toolDigest:'d'.repeat(64),inputSha256:spec.inputSha256,payloadDigest:'e'.repeat(64),
      expiresAt:Date.now()+240_000,pricing:{model:'free',note:'fixture',declaration:'provider_unverified'}}};
  return spec;
}
const extra=async spec=>({executionReviewDigest:await workToolExecutionReviewDigest(spec.executionReview),executionContext:spec.executionReview.approvalContext});
const read=async f=>(await f.call(f.work,'GET')).body.jobs.find(job=>job.id===f.job.id);
async function oldPending(f) {
  const spec=f.attempt(), token='T'.repeat(43),expiresAt=Date.now()+60_000;
  const capabilityHash=await workToolCapabilityHash({owner:'alice',jobId:f.job.id,attemptId:spec.id,inputSha256:spec.inputSha256,expiresAt,token});
  const job={...f.job,revision:1,toolAttempts:[{schema:'rockstaros.work-tool-attempt/1',...spec,state:'pending',
    startedAt:new Date().toISOString(),capabilityHash,capabilityExpiresAt:expiresAt}]};
  f.sqlite.prepare('UPDATE work_jobs SET payload=?,revision=? WHERE id=?').run(JSON.stringify(job),1,job.id);
  return {spec,capability:{token,expiresAt},job};
}

void test('counterexample legacy begin on actual creation-reviewed job is rejected before saving',async t=>{
  const f=await reviewedJob(t),spec=f.attempt(),before=await read(f);
  assert.notEqual(spec.inputSha256,f.creationReview.inputSha256);
  const result=await f.begin(f.job.id,0,spec);
  assert.equal(result.status,409);assert.equal(result.body.operationCapability,undefined);
  assert.deepEqual(await read(f),before);
});
void test('counterexample legacy claim on existing creation-reviewed pending is rejected and preserved',async t=>{
  const f=await reviewedJob(t),old=await oldPending(f);
  assert.equal((await f.claim(f.job.id,old.spec,old.capability)).status,403);
  assert.equal((await f.begin(f.job.id,0,old.spec)).status,409);
  const upgrade={...reviewed(f),id:old.spec.id};
  assert.equal((await f.begin(f.job.id,1,upgrade)).status,409);
  assert.equal((await f.claim(f.job.id,old.spec,old.capability,await extra(upgrade))).status,403);
  assert.deepEqual(await read(f),old.job);
});
void test('new-job reviewed begin and exact replay preserve creation and never reissue authority',async t=>{
  const f=await reviewedJob(t),spec=reviewed(f),started=await f.begin(f.job.id,0,spec);
  assert.equal(started.status,200);assert.equal(started.body.saved,true);
  assert.deepEqual(started.body.job.agentBinding.creationReview,f.creationReview);
  assert.deepEqual(started.body.job.toolAttempts[0].creationRelation.changedFields,['input']);
  const replay=await f.begin(f.job.id,0,spec);assert.equal(replay.status,200);assert.equal(replay.body.saved,false);
  assert.equal(replay.body.operationCapability,undefined);
  const legacy={...spec};delete legacy.executionReview;
  assert.equal((await f.begin(f.job.id,0,legacy)).status,409);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability)).status,403);
  const results=await Promise.all([f.claim(f.job.id,spec,started.body.operationCapability,await extra(spec)),
    f.claim(f.job.id,spec,started.body.operationCapability,await extra(spec))]);
  assert.deepEqual(results.map(r=>r.status).sort((a,b)=>a-b),[200,403]);
  assert.deepEqual((await read(f)).agentBinding.creationReview,f.creationReview);
});
void test('old client and old job retain legacy pending replay, one-use claim and missing record',async t=>{
  const f=await setup(t),spec=f.attempt(),started=await f.begin(f.job.id,0,spec);
  assert.equal(started.status,200);assert.equal(started.body.job.agentBinding.creationReview,undefined);
  assert.equal(started.body.job.toolAttempts[0].executionReview,undefined);
  const replay=await f.begin(f.job.id,0,spec);assert.equal(replay.status,200);assert.equal(replay.body.saved,false);
  assert.equal(replay.body.operationCapability,undefined);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability)).status,200);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability)).status,403);
  const job=(await f.call(f.work,'GET')).body.jobs[0];assert.equal(await storedWorkToolExecutionReview(job,job.toolAttempts[0]),null);
});
void test('new-job wrong owner and tampered reviews fail without consuming valid pending',async t=>{
  const f=await reviewedJob(t),spec=reviewed(f);
  assert.equal((await f.begin(f.job.id,0,spec,{owner:'bob'})).status,409);
  const wrong={...spec,executionReview:{...spec.executionReview,ownerScope:'owner-v1:'+'f'.repeat(64)}};
  assert.equal((await f.begin(f.job.id,0,wrong)).status,409);
  const started=await f.begin(f.job.id,0,spec);assert.equal(started.status,200);
  const claim=await extra(spec);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,{...claim,ownerScope:'owner-v1:'+'f'.repeat(64)})).status,403);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,{...claim,executionContext:{...claim.executionContext,toolDigest:'a'.repeat(64)}})).status,403);
  const before=await read(f),bad=structuredClone(before);delete bad.toolAttempts[0].executionReview;delete bad.toolAttempts[0].executionReviewDigest;delete bad.toolAttempts[0].creationRelation;
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(bad),bad.id);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability)).status,403);
  assert.deepEqual(await read(f),bad);
  f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(before),before.id);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,claim)).status,200);
});
void test('legacy compatibility cannot win a read-to-commit race introducing creationReview',async t=>{
  for(const operation of ['begin','claim']) {
    const f=await reviewedJob(t);f.job=f.legacyJob;const spec=f.attempt();
    const started=operation==='claim'?await f.begin(f.job.id,0,spec):null;
    if(started)assert.equal(started.status,200);
    f.db.beforeRun=sql=>{if(!sql.startsWith('UPDATE work_jobs'))return;f.db.beforeRun=null;
      const row=f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.job.id),job=JSON.parse(row.payload);
      job.agentBinding.creationReview=f.creationReview;
      f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job),job.id);
    };
    const result=operation==='begin'?await f.begin(f.job.id,0,spec):await f.claim(f.job.id,spec,started.body.operationCapability);
    assert.equal(result.status,operation==='begin'?409:403);
    const job=await read(f);assert.equal(job.toolAttempts?.length??0,operation==='begin'?0:1);
    if(operation==='claim')assert.equal(job.toolAttempts[0].state,'pending');
  }
});
