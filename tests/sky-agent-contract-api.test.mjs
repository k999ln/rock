import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRouteFixture } from './route-fixture.mjs';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import * as auth from '../lib/request-auth.ts';
import { createSkyToolPackageDraft, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { workToolExecutionReviewDigest } from '../lib/workflow.ts';
import { SKY_TOOL_CONTRACT_ANNOTATION } from '../lib/sky-agent-requirements.ts';
import * as operations from '../lib/operations.ts';
import { skyPackageSchemaSha256 } from '../lib/sky-package-runtime.ts';

async function setup(t, persistent = false, authorityAvailable = true, reviewExpiresAt = null, simulateOldBegin = false) {
  const dir = persistent ? mkdtempSync(join(tmpdir(), 'work-attempt-test-')) : null;
  const dbPath = dir ? join(dir, 'fixture.sqlite') : ':memory:';
  const sqlite = new DatabaseSync(dbPath); t.after(() => { sqlite.close(); if (dir) rmSync(dir, { recursive: true, force: true }); });
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(f => f.endsWith('.sql') && !f.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, afterRun: null, sqlForTest: null, prepare(sql) {
    const statement = db.sqlForTest ? db.sqlForTest(sql) : sql;
    return { bind(...args) { return {
    async first() { return sqlite.prepare(statement).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(statement).all(...args) }; },
    async run() { db.beforeRun?.(sql, args); const changes = Number(sqlite.prepare(statement).run(...args).changes); db.afterRun?.(sql, args); return { meta: { changes } }; },
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
  for (const name of ['sky-agent-library', 'sky-agent-requirements', 'bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store', 'sky-tool-package', 'sky-package-runtime'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  dependencies.set('@/lib/operations',operations);
  const agents=loadRouteFixture(new URL('../app/api/sky/agents/route.ts',import.meta.url),dependencies);
  const work = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const beginDependencies = new Map(dependencies);
  if (simulateOldBegin) beginDependencies.set('@/lib/sky-agent-requirements', {
    ...dependencies.get('@/lib/sky-agent-requirements'), reviewSkyAgentPackageContract: () => ({ state:'candidate', issues:[] }),
  });
  const observations = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/route.ts', import.meta.url), beginDependencies);
  const claims = loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/claim/route.ts', import.meta.url), dependencies);
  async function call(route, method, payload, { owner = ownerId, scope, origin = baseOrigin } = {}) {
    const response = await route[method](new Request(`${baseOrigin}${route===agents?'/api/sky/agents':'/api/work-jobs'}${route === observations ? '/tool-observations' : route === claims ? '/tool-observations/claim' : ''}`, {
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
  const review = typeof reviewExpiresAt === 'function' ? reviewExpiresAt(sqlite)
    : { reviewedAt: Date.now(), expiresAt: reviewExpiresAt };
  sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), 'dev.fixture.counter@1.0.0', manifestSha256, 'fixture-reviewer', 'verified', '{}', '{}', '', review.reviewedAt, review.expiresAt);
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
  return { agents, sqlite, db, dbPath, call, work, observations, claims, role, job: created.body.job, scope, attempt, result, begin, observe, claim };
}


async function typed(t, missingProperties, simulateOldBegin=false){
 const f=await setup(t,false,true,null,simulateOldBegin),old=f.attempt();
 const manifest=JSON.parse(f.sqlite.prepare('SELECT manifest FROM sky_tool_packages LIMIT 1').get().manifest);
 const permissions=manifest.capabilities.permissions.map(permission=>({permission,scopes:permission==='network'?['origin:fixture']:[]}));
 manifest.io.inputSchema={type:'object',properties:{text:{type:'string'}},required:['text'],additionalProperties:false,
 [SKY_TOOL_CONTRACT_ANNOTATION]:{schema:'rockstaros.tool-capability/1',capabilityIds:['fixture.count'],permissions}};
 manifest.io.outputSchema={type:'object',properties:{count:{type:'integer'}},required:['count'],additionalProperties:false};
 if(missingProperties){
   manifest.io.inputSchema.properties={};manifest.io.inputSchema.required=[];
   manifest.io.outputSchema.properties={};manifest.io.outputSchema.required=[];
   delete manifest.io[missingProperties].properties;
 }
 const manifestSha256=await skyToolPackageSha256(manifest);
 f.sqlite.prepare('UPDATE sky_tool_packages SET manifest=?,manifest_sha256=?').run(JSON.stringify(manifest),manifestSha256);
 f.sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(),old.packageKey,manifestSha256,'fixture-reviewer','verified','{}','{}','',Date.now(),null);
 const requirements={inputFields:['text'],outputFields:['count'],packageKey:old.packageKey,executionTarget:'pc',
 contract:{schema:'rockstaros.agent-tool-expectation/1',inputTypes:{text:'string'},outputTypes:{count:'integer'},capabilityIds:['fixture.count'],allowedPermissions:permissions,
 runtime:{serverId:old.connectorId,toolName:old.toolName}}};
 if(missingProperties){requirements.inputFields=[];requirements.outputFields=[];requirements.contract.inputTypes={};requirements.contract.outputTypes={};}
 const settings={name:f.role.name,instructions:f.role.instructions,provider:f.role.provider,model:f.role.model,enabled:true,requirements};
 const save=await f.call(f.agents,'PUT',{id:f.role.id,revision:f.role.revision,settings},{scope:f.scope});assert.equal(save.status,200,JSON.stringify(save.body));f.role=save.body.agent;
 const created=await f.call(f.work,'POST',{id:randomUUID(),title:'typed intent job',templateId:'article',agentRef:{id:f.role.id,revision:f.role.revision}},{scope:f.scope});assert.equal(created.status,201);f.job=created.body.job;
 const spec=()=>{const value={...f.attempt(),manifestSha256};return {...value,executionReview:{schema:'rockstaros.work-tool-execution-review/1',ownerScope:f.scope,jobId:f.job.id,jobRevision:0,
 agentId:f.role.id,agentRevision:f.role.revision,packageKey:value.packageKey,manifestSha256,packagePricing:{model:'free',note:manifest.pricing.note,declaration:'provider_unverified'},
 approvalContext:{schema:'rockstaros.mcp-approval-context/1',connectorId:value.connectorId,toolName:value.toolName,transport:'stdio',toolDigest:'d'.repeat(64),inputSha256:value.inputSha256,
 payloadDigest:'e'.repeat(64),expiresAt:Date.now()+240000,pricing:{model:'free',note:'fixture',declaration:'provider_unverified'}}}};};
 const extra=async value=>({agentRevision:f.role.revision,executionReviewDigest:await workToolExecutionReviewDigest(value.executionReview),executionContext:value.executionReview.approvalContext,
 inputSchemaSha256:await skyPackageSchemaSha256(manifest.io.inputSchema),outputSchemaSha256:await skyPackageSchemaSha256(manifest.io.outputSchema)});
 return {...f,manifest,settings,requirements,spec,extra};
}
void test('direct begin rejects unconfirmed input or output schema even for empty field lists',async t=>{
 for(const side of ['inputSchema','outputSchema']){
  const f=await typed(t,side);
  assert.equal((await f.begin(f.job.id,0,f.spec())).status,409);
  const job=(await f.call(f.work,'GET')).body.jobs.find(j=>j.id===f.job.id);
  assert.equal(job.toolAttempts?.length??0,0);
 }
});
void test('claim rejects a pending attempt admitted by an older begin with unconfirmed schema',async t=>{
 for(const side of ['inputSchema','outputSchema']){
  const f=await typed(t,side,true),spec=f.spec();
  const started=await f.begin(f.job.id,0,spec);assert.equal(started.status,200);
  assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,await f.extra(spec))).status,403);
  const job=(await f.call(f.work,'GET')).body.jobs.find(j=>j.id===f.job.id);
  assert.equal(job.toolAttempts[0].state,'pending');
 }
});
void test('typed conditions are enforced at begin and claim without widening legacy authority',async t=>{
 const f=await typed(t),spec=f.spec(),legacy={...spec};delete legacy.executionReview;
 assert.equal((await f.begin(f.job.id,0,legacy)).status,409);
 const started=await f.begin(f.job.id,0,spec);assert.equal(started.status,200,JSON.stringify(started.body));
 assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,{agentRevision:f.role.revision})).status,403);
 assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,{...await f.extra(spec),inputSchemaSha256:'e'.repeat(64)})).status,403);
 const claim=await f.claim(f.job.id,spec,started.body.operationCapability,await f.extra(spec));assert.equal(claim.status,200,JSON.stringify(claim.body));
 assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,await f.extra(spec))).status,403);
});
void test('typed begin rejects another owner or a different selected Tool even with exact schemas',async t=>{
 const f=await typed(t),spec=f.spec();
 assert.equal((await f.begin(f.job.id,0,spec,{owner:'bob'})).status,409);
 for(const key of ['connectorId','toolName']){
  const bad=structuredClone(spec);bad[key]='different';bad.executionReview.approvalContext[key]='different';
  assert.equal((await f.begin(f.job.id,0,bad)).status,409);
 }
 const read=(await f.call(f.work,'GET')).body.jobs.find(j=>j.id===f.job.id);assert.equal(read.toolAttempts?.length??0,0);
});
void test('old five-field and four-field editors cannot erase or implicitly change typed conditions',async t=>{
 const f=await typed(t),legacy={...f.requirements};delete legacy.contract;
 const five={...f.settings};delete five.requirements;
 const a=await f.call(f.agents,'PUT',{id:f.role.id,revision:f.role.revision,settings:five},{scope:f.scope});assert.equal(a.status,200);assert.deepEqual(a.body.agent.requirements,f.requirements);
 const b=await f.call(f.agents,'PUT',{id:f.role.id,revision:a.body.agent.revision,settings:{...f.settings,requirements:legacy}},{scope:f.scope});assert.equal(b.status,200);assert.deepEqual(b.body.agent.requirements,f.requirements);
 const stale=await f.call(f.agents,'PUT',{id:f.role.id,revision:a.body.agent.revision,settings:f.settings},{scope:f.scope});assert.equal(stale.status,409);
 const changed=await f.call(f.agents,'PUT',{id:f.role.id,revision:b.body.agent.revision,settings:{...f.settings,requirements:{...legacy,inputFields:[]}}},{scope:f.scope});assert.equal(changed.status,409);
 assert.equal((await f.call(f.work,'GET')).body.jobs.some(j=>j.id===f.job.id),true,'old job remains readable');
});
void test('condition revision change after begin prevents claim and retains the pending record',async t=>{
 const f=await typed(t),spec=f.spec(),started=await f.begin(f.job.id,0,spec);assert.equal(started.status,200);
 const changed={...f.requirements,contract:{...f.requirements.contract,allowedPermissions:[]}};
 const saved=await f.call(f.agents,'PUT',{id:f.role.id,revision:f.role.revision,settings:{...f.settings,requirements:changed}},{scope:f.scope});assert.equal(saved.status,200);
 assert.equal((await f.claim(f.job.id,spec,started.body.operationCapability,await f.extra(spec))).status,403);
 const job=(await f.call(f.work,'GET')).body.jobs.find(j=>j.id===f.job.id);assert.equal(job.toolAttempts[0].state,'pending');
});
void test('explicit mismatched field types or permission scope do not pass Package admission',async t=>{
 for(const patch of [{inputTypes:{text:'integer'}},{allowedPermissions:[]}]){
  const f=await typed(t),changed={...f.requirements,contract:{...f.requirements.contract,...patch}};
  // Model a committed same-revision provider/intent mutation, independent of normal CAS.
  f.sqlite.prepare('UPDATE sky_agent_settings SET settings=? WHERE id=?').run(JSON.stringify({...f.settings,requirements:changed}),f.role.id);
  assert.equal((await f.begin(f.job.id,0,f.spec())).status,409);
 }
});
void test('same-revision condition mutation at begin or claim cannot win the atomic commit',async t=>{
 for(const operation of ['begin','claim']){
  const f=await typed(t),spec=f.spec(),started=operation==='claim'?await f.begin(f.job.id,0,spec):null;
  if(started)assert.equal(started.status,200);
  f.db.beforeRun=sql=>{if(!sql.startsWith('UPDATE work_jobs'))return;f.db.beforeRun=null;
   const changed={...f.requirements,contract:{...f.requirements.contract,allowedPermissions:[]}};
   f.sqlite.prepare('UPDATE sky_agent_settings SET settings=? WHERE id=?').run(JSON.stringify({...f.settings,requirements:changed}),f.role.id);
  };
  const result=operation==='begin'?await f.begin(f.job.id,0,spec):await f.claim(f.job.id,spec,started.body.operationCapability,await f.extra(spec));
  assert.equal(result.status,operation==='begin'?409:403);
  const job=(await f.call(f.work,'GET')).body.jobs.find(j=>j.id===f.job.id);assert.equal(job.toolAttempts?.length??0,operation==='begin'?0:1);
  if(operation==='claim')assert.equal(job.toolAttempts[0].state,'pending');
 }
});
