import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { releaseRuntimeFixture } from './helpers/noah-release-runtime-fixture.mjs';
import { createNoahInstanceService,createNoahInstancesApi,resolveNoahPin } from '../lib/noah-instances.ts';
import { noahAgentStore } from '../lib/noah-agent-store.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const claim='a'.repeat(64),owner='author-fixture';
async function fixture(t) {
  const f=await releaseRuntimeFixture();t.after(()=>f.close());
  f.sqlite.exec(readFileSync(new URL('../drizzle/0038_noah_instances.sql',import.meta.url),'utf8'));
  const service=createNoahInstanceService(f.deps);
  async function version(v,other=owner,family=f.template.manifest.id) {
    const id=randomUUID(),manifest={...f.template.manifest,id:family,version:v,runtime:{...f.template.manifest.runtime,model:'none'}},source={key:id,name:'main.mjs',bytes:8,sha256:hash(['source',id])};
    const store=noahAgentStore(f.db,other);
    await store.reserve({id,manifest,manifestSha256:hash(manifest),source});await store.complete(id,source,{engine:'noah-source-refactor/1',status:'unchanged',validation:'not_run',message:'synthetic',changes:[]});
    return resolveNoahPin(f.deps,other,id);
  }
  async function begin(pin,instance=null,extras={}) {
    const input={id:instance?.id||randomUUID(),revision:instance?.revision||0,commandId:randomUUID(),agentId:pin.agentId,digest:pin.digest,claimSha256:hash(claim),replacePending:false,...extras};
    return {input,instance:await service.prepare(owner,input)};
  }
  const finish=(input,state='selected')=>service.finish(owner,{id:input.id,commandId:input.commandId,claim,state});
  return {...f,service,version,begin,finish};
}

void test('immutable versions prepare then select; failure retains old version; retry and rollback leave old Work intact',async t=>{
  const f=await fixture(t),v1=await f.version('1.0.0'),v2=await f.version('2.0.0');
  const a=await f.begin(v1);assert.equal(a.instance.active,null);assert.equal('claimSha256' in a.instance.pending,false);
  const first=await f.finish(a.input);assert.equal(first.active.digest,v1.digest);
  const oldWork={id:randomUUID(),noahExecution:{agentId:v1.agentId,version:'1.0.0',state:'running',source:{manifestSha256:v1.manifestSha256}}};
  const saved=JSON.stringify(oldWork);f.sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(oldWork.id,owner,saved,1,new Date().toISOString());
  const b=await f.begin(v2,first);assert.equal(b.instance.active.digest,v1.digest);
  const failed=await f.finish(b.input,'failed');assert.equal(failed.active.digest,v1.digest);assert.equal(failed.last.state,'failed');
  const retry=await f.begin(v2,failed);const second=await f.finish(retry.input);assert.equal(second.active.digest,v2.digest);assert.equal(second.history[0].digest,v1.digest);
  const back=await f.begin(v1,second);const restored=await f.finish(back.input);assert.equal(restored.active.digest,v1.digest);
  assert.equal(f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(oldWork.id).payload,saved);
  assert.equal((await f.service.get(owner,restored.id)).revision,restored.revision);
});

void test('concurrent changes have one CAS winner, retries do not duplicate, and cancellation fences delayed commits',async t=>{
  const f=await fixture(t),v1=await f.version('1.0.0'),v2=await f.version('2.0.0'),v3=await f.version('3.0.0');
  const a=await f.begin(v1),first=await f.finish(a.input);
  const races=await Promise.allSettled([f.begin(v2,first),f.begin(v3,first)]);
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.find(r=>r.status==='rejected').reason.status,409);
  const winner=races.find(r=>r.status==='fulfilled').value;
  assert.equal((await f.service.prepare(owner,winner.input)).revision,winner.instance.revision);
  await assert.rejects(f.service.prepare(owner,{...winner.input,claimSha256:hash('b'.repeat(64))}),{status:409});
  const cancelled=await f.service.cancel(owner,first.id,winner.instance.revision);
  await assert.rejects(f.finish(winner.input),{status:409});assert.equal(cancelled.active.digest,v1.digest);
  const next=await f.begin(v3,cancelled);const result=await f.finish(next.input);
  assert.equal((await f.finish(next.input)).revision,result.revision);
  await assert.rejects(f.service.prepare(owner,winner.input),{status:409});
});

void test('owner and family are immutable; rollback cannot reactivate removed source or revoked purchase',async t=>{
  const f=await fixture(t),v1=await f.version('1.0.0'),foreign=await f.version('1.0.0','other'),different=await f.version('1.0.0',owner,'different-agent');
  const a=await f.begin(v1),first=await f.finish(a.input);
  await assert.rejects(f.service.get('other',first.id),{status:404});
  await assert.rejects(f.begin(foreign,first),{status:404});await assert.rejects(f.begin(different,first),{status:409});
  const pending=await f.begin(v1,first);await noahAgentStore(f.db,owner).remove(v1.agentId);
  await assert.rejects(f.finish(pending.input),{status:404});assert.equal((await f.service.get(owner,first.id)).active.digest,v1.digest);
  const releaseId='release-'+f.p.manifestSha256;
  await assert.rejects(resolveNoahPin(f.deps,'buyer-fixture',releaseId),{status:409});await f.review();
  await assert.rejects(resolveNoahPin(f.deps,'buyer-fixture',releaseId),{status:403});f.purchase();
  const pin=await resolveNoahPin(f.deps,'buyer-fixture',releaseId),input={id:randomUUID(),revision:0,commandId:randomUUID(),agentId:pin.agentId,digest:pin.digest,claimSha256:hash(claim),replacePending:false};
  await f.service.prepare('buyer-fixture',input);f.setPayment('refunded');
  await assert.rejects(f.service.finish('buyer-fixture',{id:input.id,commandId:input.commandId,claim,state:'selected'}),{status:403});
});

void test('library removal rejects active/unknown Work and schedules, retains sources, then can re-add',async t=>{
  const f=await fixture(t),v1=await f.version('1.0.0'),a=await f.begin(v1),first=await f.finish(a.input),jobId=randomUUID();
  const put=p=>f.sqlite.prepare('INSERT OR REPLACE INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(jobId,owner,JSON.stringify(p),1,new Date().toISOString());
  for(const p of [{noahExecution:{agentId:v1.agentId,state:'running'}},{noahExecution:{agentId:v1.agentId,state:'unknown'}},{noahOperation:{config:{agentId:v1.agentId},state:'enabled'}}]) {
    put(p);await assert.rejects(f.service.remove(owner,first.id,first.revision),{status:409});
  }
  put({noahExecution:{agentId:v1.agentId,state:'cancelled'}});
  const removed=await f.service.remove(owner,first.id,first.revision);assert.equal(removed.removed,true);
  assert.ok(await noahAgentStore(f.db,owner).get(v1.agentId));assert.ok(f.sqlite.prepare('SELECT id FROM work_jobs WHERE id=?').get(jobId));
  const again=await f.begin(v1,removed);assert.equal((await f.finish(again.input)).removed,false);
});

void test('API isolates accounts, enforces Origin and scope, and only returns authoritative candidate pins',async t=>{
  const f=await fixture(t),api=createNoahInstancesApi(f.deps),v1=await f.version('1.0.0'),v2=await f.version('2.0.0');
  const headers={'test-owner':owner,Origin:'http://localhost','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor(owner)};
  const get=await api(new Request('http://localhost/api/noah/instances?agentId='+v1.agentId,{headers}));const data=await get.json();
  const original=await resolveNoahPin(f.deps,owner,f.id);
  assert.equal(get.status,200);assert.deepEqual(new Set(data.pins.map(p=>p.digest)),new Set([v1.digest,v2.digest,original.digest]));
  const input={action:'prepare',id:randomUUID(),revision:0,commandId:randomUUID(),agentId:v1.agentId,digest:v1.digest,claimSha256:hash(claim),replacePending:false};
  const post=h=>api(new Request('http://localhost/api/noah/instances',{method:'POST',headers:h,body:JSON.stringify(input)}));
  assert.equal((await post({...headers,Origin:'https://foreign.example'})).status,403);
  assert.equal((await post({...headers,'X-Rock-Owner-Scope':await ownerScopeFor('other')})).status,409);
  assert.equal((await post(headers)).status,200);
  const unrelated=await api(new Request('http://localhost/api/noah/instances?id='+input.id,{headers:{'test-owner':'other'}}));assert.equal(unrelated.status,404);
});
