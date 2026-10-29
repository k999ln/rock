import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { loadRouteFixture } from './route-fixture.mjs';
import { skyAgentLibraryStore } from '../lib/sky-agent-library-store.ts';
import { defaultSkyAgentSettings } from '../lib/sky-agent-library.ts';
import { createHash } from 'node:crypto';
import { createLineCounter } from '../toolkits/sky-tool-sdk/examples/line-counter.mjs';
import { skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { parseWorkAgentCreationReview } from '../lib/workflow.ts';
import * as requestAuth from '../lib/request-auth.ts';

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const path of readdirSync(new URL('../drizzle/', import.meta.url)).filter(path => path.endsWith('.sql') && !path.startsWith('._')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${path}`, import.meta.url), 'utf8'));
  const db = { beforeRun: null, prepare(sql) { return { bind(...args) { return {
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
    async run() { db.beforeRun?.(sql, args); return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
  }; } }; } };
  const dependencies = new Map([
    ['cloudflare:workers', { env: { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED: 'false' } }],
    ['@/lib/fund-store', { database: () => db, requestUser: requestAuth.requestUser }],
  ]);
  for (const name of ['bounded-stream', 'owner-intent', 'a2a-delegation-store', 'work-store', 'workflow', 'rockstar-service-access', 'sky-agent-library-store'])
    dependencies.set(`@/lib/${name}`, await import(new URL(`../lib/${name}.ts`, import.meta.url)));
  const route = loadRouteFixture(new URL('../app/api/work-jobs/route.ts', import.meta.url), dependencies);
  const call = async (method, input, owner = 'alice', scope, exactId) => {
    const response = await route[method](new Request('https://fixture.invalid/api/work-jobs' + (exactId ? '?id='+encodeURIComponent(exactId) : ''), {
      method, headers: { Origin: 'https://fixture.invalid', 'Content-Type': 'application/json',
        ...(owner ? { 'oai-authenticated-user-id': owner } : {}), ...(scope === undefined ? {} : { 'X-Rock-Owner-Scope': scope }) },
      ...(method === 'GET' ? {} : { body: JSON.stringify(input) }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const agent = async (owner = 'alice', enabled = true) => skyAgentLibraryStore(db, owner).save(randomUUID(), 0,
    { ...defaultSkyAgentSettings('本人担当', '本人が定めた役割'), enabled }, true);
  return { sqlite, db, call, agent };
}
const input = (agent, change = {}) => ({ id: randomUUID(), title: '合成の本人仕事', templateId: 'article',
  agentRef: { id: agent.id, revision: agent.revision }, ...change });
const scopeFor = async (f, owner) => (await f.call('GET', undefined, owner)).body.ownerScope;

void test('authenticated owner binds the exact role, preserves it on job edit, and same-ID response recovery is read-only', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  const created = await f.call('POST', request);
  assert.equal(created.status, 201);
  const binding = created.body.job.agentBinding;
  assert.equal(binding.schema, 'rockstaros.work-agent-binding/1');
  assert.equal(binding.agentId, agent.id); assert.equal(binding.agentRevision, agent.revision);
  assert.match(binding.requestDigest, /^[a-f0-9]{64}$/);
  const edited = await f.call('PATCH', { jobId: request.id, revision: 0,
    command: { id: randomUUID(), action: 'edit_plan', schemaVersion: 1, objective: '本人が編集した目的' } });
  assert.equal(edited.status, 200); assert.deepEqual(edited.body.job.agentBinding, binding);
  const rowsBefore = f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n;
  const replay = await f.call('POST', request);
  assert.equal(replay.status, 200); assert.equal(replay.body.created, false);
  assert.equal(replay.body.job.revision, 1); assert.deepEqual(replay.body.job.agentBinding, binding);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, rowsBefore);
  assert.equal((await f.call('POST', { ...request, title: '異なる内容' })).status, 409);
  assert.equal((await f.call('POST', { id: request.id, title: request.title, templateId: 'article' })).status, 409);
  const readback = await f.call('GET');
  assert.deepEqual(readback.body.jobs.find(job => job.id === request.id).agentBinding, binding);
  assert.equal((await f.call('GET', undefined, 'bob')).body.jobs.length, 0);
});

void test('other-owner, disabled, stale, malformed and forged owner references never create a job', async t => {
  const f = await fixture(t), agent = await f.agent(), disabled = await f.agent('alice', false);
  assert.equal((await f.call('POST', input(agent), 'bob')).status, 409);
  assert.equal((await f.call('POST', input(disabled))).status, 409);
  assert.equal((await f.call('POST', input(agent, { agentRef: { id: agent.id, revision: agent.revision + 1 } }))).status, 409);
  assert.equal((await f.call('POST', input(agent, { agentRef: { id: agent.id, revision: 1, owner: 'alice' } }))).status, 400);
  assert.equal((await f.call('POST', input(agent, { agentBinding: { agentId: agent.id } }))).status, 400);
  const aliceScope = await scopeFor(f, 'alice');
  assert.equal((await f.call('POST', input(agent), 'bob', aliceScope)).status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
});

void test('atomic job insertion fails closed if the selected role is modified or disabled after verification', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  f.db.beforeRun = (sql) => {
    if (!sql.includes('INSERT INTO work_jobs')) return;
    f.db.beforeRun = null;
    f.sqlite.prepare('UPDATE sky_agent_settings SET revision = revision + 1 WHERE owner_user_id = ? AND id = ?').run('alice', agent.id);
  };
  const result = await f.call('POST', request);
  assert.equal(result.status, 409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM work_jobs').get().n, 0);
});

void test('same-ID recovery remains possible after later role revision without authorizing a new execution', async t => {
  const f = await fixture(t), agent = await f.agent(), request = input(agent);
  assert.equal((await f.call('POST', request)).status, 201);
  await skyAgentLibraryStore(f.db, 'alice').save(agent.id, agent.revision,
    { ...defaultSkyAgentSettings('変更した担当', '後から編集した役割'), enabled: false });
  const recovered = await f.call('POST', request);
  assert.equal(recovered.status, 200); assert.equal(recovered.body.created, false);
  assert.equal(recovered.body.job.agentBinding.agentRevision, agent.revision);
  assert.equal((await f.call('POST', input(agent))).status, 409);
});

async function reviewedFixture(t) {
  const f = await fixture(t), manifest = createLineCounter({publicMcpUrl:'https://example.invalid/mcp',skyUrl:'https://example.invalid',developerToken:'fixture-only-no-credential',fetch:async()=>{throw new Error('EXTERNAL_NETWORK_FORBIDDEN')}}).manifests()[0];
  const packageKey = skyToolPackageKey(manifest), manifestSha256 = await skyToolPackageSha256(manifest);
  f.sqlite.prepare(`INSERT INTO sky_tool_packages (package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(packageKey,manifest.id,manifest.version,'author',JSON.stringify(manifest),manifestSha256,'verified',Date.now(),Date.now());
  f.sqlite.prepare(`INSERT INTO sky_tool_package_reviews (id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(randomUUID(),packageKey,manifestSha256,'reviewer','verified','{}','{}','',Date.now());
  const agent = await skyAgentLibraryStore(f.db,'alice').save(randomUUID(),0, {
    ...defaultSkyAgentSettings('確認する担当','行数を数える'), requirements: { packageKey, executionTarget:'pc',inputFields:['text'],outputFields:['lines'] } },true);
  const args = { text:'fixture input' }, scope = await scopeFor(f,'alice');
  const review = { schema:'rockstaros.work-agent-creation-review/1',ownerScope:scope,agentId:agent.id,agentRevision:agent.revision,
    packageKey,manifestSha256,serverId:'fixture-connector',toolName:'count_lines',transport:'local_http',toolDigest:'a'.repeat(64),
    inputSha256:createHash('sha256').update(JSON.stringify(args)).digest('hex'),
    pricing:{ model:'free',packageNote:manifest.pricing.note,runtimeNote:'provider fixture declaration',declaration:'provider_unverified' } };
  return {...f,agent,review,args,request:input(agent,{creationReview:review,creationInput:args,creationReviewExpiresAt:Date.now()+29000})};
}
void test('versioned creation disclosure is owner/Agent/Package/input bound and same-ID recovery survives later changes',async t=>{
  const f=await reviewedFixture(t), first=await f.call('POST',f.request);
  assert.equal(first.status,201,JSON.stringify(first.body));
  assert.deepEqual(first.body.job.agentBinding.creationReview,f.review);
  assert.equal(first.body.job.toolAttempts,undefined);
  f.sqlite.prepare("UPDATE sky_tool_packages SET status='withdrawn'").run();
  f.sqlite.prepare('UPDATE sky_agent_settings SET revision=revision+1').run();
  const retry=await f.call('POST',f.request);assert.equal(retry.status,200);assert.equal(retry.body.created,false);
  assert.deepEqual(retry.body.job.agentBinding,first.body.job.agentBinding);
  assert.equal((await f.call('POST',{...f.request,creationInput:{text:'changed'}})).status,409);
  assert.equal((await f.call('POST',{...f.request,creationReview:{...f.review,serverId:'different-runtime'}})).status,409);
  assert.equal((await f.call('POST',f.request,'bob')).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,1);
});
void test('new disclosure rejects missing input, changed hash/owner/Agent/manifest/pricing and extra fields before inserting',async t=>{
  const f=await reviewedFixture(t);
  const bad=[{...f.request,creationInput:undefined},
    {...f.request,creationReview:null},
    {...f.request,creationInput:{text:'different'}},
    {...f.request,agentRef:undefined},
    ...[{ownerScope:'other'},{agentRevision:f.agent.revision+1},{manifestSha256:'b'.repeat(64)},
      {pricing:{...f.review.pricing,model:'usage'}},{pricing:{...f.review.pricing,packageNote:'changed'}},
      {pricing:{...f.review.pricing,declaration:'verified'}},{extra:true}]
      .map(change=>({...f.request,creationReview:{...f.review,...change}}))];
  for(const request of bad){const result=await f.call('POST',request);assert.ok([400,409].includes(result.status),JSON.stringify(result));}
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);
});
void test('Package review/status/manifest and Agent requirements are checked in the actual creation SQL CAS',async t=>{
  for(const mutation of ["UPDATE sky_tool_packages SET status='withdrawn'",'DROP TRIGGER sky_tool_package_reviews_no_delete; DELETE FROM sky_tool_package_reviews',
    'DROP TRIGGER sky_tool_package_reviews_no_update; UPDATE sky_tool_package_reviews SET expires_at=1',
    "UPDATE sky_tool_packages SET manifest=json_set(manifest,'$.pricing.note','changed')",
    "UPDATE sky_agent_settings SET settings=json_set(settings,'$.requirements.packageKey','other.tool@1.0.0')"]){
    const f=await reviewedFixture(t);
    f.db.beforeRun=sql=>{if(!sql.includes('INSERT INTO work_jobs'))return;f.db.beforeRun=null;f.sqlite.exec(mutation);};
    const result=await f.call('POST',f.request);assert.equal(result.status,409,JSON.stringify(result.body));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);
  }
});
void test('non-Agent legacy create and old Agent client remain save-compatible without invented confirmation',async t=>{
  const f=await reviewedFixture(t),unbound=await f.call('POST',{id:randomUUID(),title:'legacy',templateId:'article'});
  assert.equal(unbound.status,201);assert.equal(unbound.body.job.agentBinding,undefined);
  const legacy=await f.call('POST',input(f.agent));assert.equal(legacy.status,201);
  assert.equal(legacy.body.job.agentBinding.creationReview,undefined);
  const stop=await f.call('PATCH',{jobId:legacy.body.job.id,revision:0,command:{id:randomUUID(),action:'cancel'}});
  assert.equal(stop.status,200);assert.equal(stop.body.job.status,'cancelled');
});

void test('expired and excessive creation deadlines cannot insert, but expired same-ID recovery is read-only',async t=>{
  const f=await reviewedFixture(t);
  for(const expires of [undefined, null, 0, Date.now()-1, Date.now()+60000]) {
    const result=await f.call('POST',{...f.request,creationReviewExpiresAt:expires});
    assert.ok([400,409].includes(result.status),JSON.stringify(result));
  }
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);
  assert.equal((await f.call('POST',f.request)).status,201);
  const retry=await f.call('POST',{...f.request,creationReviewExpiresAt:1});
  assert.equal(retry.status,200);assert.equal(retry.body.created,false);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,1);
});
void test('SQL expiry fence rejects a deadline that expires after API validation',async t=>{
  const f=await reviewedFixture(t);let hit=false;
  f.db.beforeRun=(sql,args)=>{
    if(!sql.includes('INSERT INTO work_jobs'))return;
    hit=true;f.db.beforeRun=null;
    // Inject an expired deadline at the SQL boundary; avoid a scheduler-sensitive sleep.
    args[8]=1;args[9]=1;
  };
  const result=await f.call('POST',f.request);assert.equal(hit,true);assert.equal(result.status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,0);
});
void test('exact ID GET stays owner-scoped beyond list limits and missing readback never creates a row',async t=>{
  const f=await reviewedFixture(t);assert.equal((await f.call('POST',f.request)).status,201);
  const saved=(await f.call('GET',undefined,'alice',undefined,f.request.id)).body.jobs[0];
  for(let i=0;i<101;i++){const id=randomUUID();f.sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)')
    .run(id,'alice',JSON.stringify({...saved,id}),0,'9999-'+String(i).padStart(4,'0'));}
  const general=await f.call('GET');assert.equal(general.body.jobs.some(job=>job.id===f.request.id),false);
  const exact=await f.call('GET',undefined,'alice',undefined,f.request.id);
  assert.equal(exact.body.jobs.length,1);assert.equal(exact.body.jobs[0].agentBinding.requestDigest,saved.agentBinding.requestDigest);
  assert.equal((await f.call('GET',undefined,'bob',undefined,f.request.id)).body.jobs.length,0);
  const missing=randomUUID();assert.equal((await f.call('GET',undefined,'alice',undefined,missing)).body.jobs.length,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,102);
  assert.equal((await f.call('POST',{...f.request,id:missing,creationReviewExpiresAt:1})).status,409);
  const renewed=await f.call('POST',{...f.request,id:missing,creationReviewExpiresAt:Date.now()+29000});
  assert.equal(renewed.status,201);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,103);
});

void test('creation review preserves Unicode text while rejecting C0 controls and invalid ID lengths',async t=>{
  const f=await reviewedFixture(t);
  for(const value of ['fixture','担当端末','e\u0301-device','👩‍💻-端末']) {
    const parsed=parseWorkAgentCreationReview({...f.review,serverId:value});
    assert.equal(parsed.serverId,value);
  }
  for(const value of ['', 'x'.repeat(121), 'bad\u0000id','bad\tid','bad\nid','bad\u001fid'])
    assert.throws(()=>parseWorkAgentCreationReview({...f.review,serverId:value}),/作成前確認/);
});
