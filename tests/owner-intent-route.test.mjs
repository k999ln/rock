import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const root = new URL('../', import.meta.url);
const {loadRouteFixture} = await import(new URL('tests/route-fixture.mjs',root));
const auth = await import(new URL('lib/request-auth.ts',root));
const terms={title:'Synthetic owner A terms',orderReference:'synthetic-a',clientLabel:'Synthetic customer A',workerName:'Synthetic worker',scope:'Local-only test',deliveryDate:'2026-10-15',deliveryPlace:'local fixture',inspectionDate:'2026-10-16',revisionScope:'one test',rights:'test only',grossYen:10000,estimatedPlatformFeePercent:22,workerFeeYen:7000,workerPaymentDate:'2026-10-31',platformRulesReference:'synthetic',customerDisclosureReference:'synthetic',workerTermsReference:'synthetic'};
const entries=[
 {name:'Material',path:'material-invention',table:'work_jobs',value:()=>({id:randomUUID(),title:'Synthetic owner A formulation',request:JSON.parse(readFileSync(new URL('contracts/material-invention-fixture.json',root),'utf8')),sample:true})},
 {name:'Mercari',path:'revenue/mercari',table:'mercari_revenue_plans',value:()=>({id:randomUUID(),channel:'consumer_assisted',title:'Synthetic owner A item',condition:'test only',facts:'Synthetic private draft A',priceJPY:3000,marketplaceFeeJPY:300,shippingJPY:750,itemCostJPY:0,otherCostJPY:0,ownsStock:true,accurate:true,prohibitedChecked:true})},
 {name:'Coconala',path:'coconala-team',table:'coconala_team_cases',value:()=>({id:randomUUID(),terms})}
];
async function setup(t) {
 const sqlite=new DatabaseSync(':memory:'); t.after(()=>sqlite.close());
 for(const name of readdirSync(new URL('drizzle/',root)).filter(n=>n.endsWith('.sql')&&!n.startsWith('._')).sort())sqlite.exec(readFileSync(new URL(`drizzle/${name}`,root),'utf8'));
 const db = {
  prepare(sql) {
   return { bind(...args) {
    return {
     async first() { return sqlite.prepare(sql).get(...args) ?? null; },
     async all() { return { results: sqlite.prepare(sql).all(...args) }; },
     async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }; },
    };
   } };
  },
 };
 const refs=new Map([['cloudflare:workers',{env:{ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false'}}],['@/lib/fund-store',{database:()=>db,requestUser:auth.requestUser}],['@/lib/request-auth',auth]]);
 for(const n of ['bounded-stream', 'owner-intent','a2a-delegation-store','workflow','work-store','material-invention','material-study','rockstar-service-access','coconala-team','coconala-team-store','operations','mercari-revenue','mercari-revenue-store'])refs.set(`@/lib/${n}`,await import(new URL(`lib/${n}.ts`,root)));
 const api=loadRouteFixture(new URL('lib/operations-api.ts',root),new Map([['./bounded-stream.ts',refs.get('@/lib/bounded-stream')],['./fund-store',refs.get('@/lib/fund-store')],['./operations',refs.get('@/lib/operations')]]));refs.set('@/lib/operations-api',api);
 const routes=new Map([...entries,{path:'work-jobs'}].map(e=>[e.path,loadRouteFixture(new URL(`app/api/${e.path}/route.ts`,root),refs)]));
 async function call(entry,method,value,owner='alice',scope) {const response=await routes.get(entry.path)[method](new Request(`https://local.test/api/${entry.path}`,{method,headers:{origin:'https://local.test','content-type':'application/json',...(scope !== undefined ? {'X-Rock-Owner-Scope':scope}:{}),...(owner?{'oai-authenticated-user-id':owner}:{})},...(method==='GET'?{}:{body:JSON.stringify(value)})}));return {status:response.status,data:await response.json()};}
 return{sqlite,call};
}
for (const entry of entries) {
 void test(`${entry.name}: A precommit failure, 401 and B retry cannot transfer the pending write`, async t => {
  const f = await setup(t), payload = entry.value();
  const a = (await f.call(entry, 'GET')).data.ownerScope;
  const b = (await f.call(entry, 'GET', undefined, 'bob')).data.ownerScope;
  assert.match(a, /^owner-v1:[a-f0-9]{64}$/); assert.notEqual(a, b);
  f.sqlite.exec(`CREATE TRIGGER fixture_fail BEFORE INSERT ON ${entry.table} BEGIN SELECT RAISE(ABORT,'synthetic before commit'); END`);
  assert.equal((await f.call(entry, 'POST', payload, 'alice', a)).status, 503);
  assert.equal((await f.call(entry, 'POST', payload, null, a)).status, 401);
  f.sqlite.exec('DROP TRIGGER fixture_fail');
  const other = await f.call(entry, 'POST', payload, 'bob', a);
  assert.equal(other.status, 409); assert.equal(other.data.code, 'OWNER_CHANGED');
  assert.equal(f.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${entry.table}`).get().n, 0);
  // Returning to the original owner preserves the exact ID and terms.
  assert.ok([200, 201].includes((await f.call(entry, 'POST', payload, 'alice', a)).status));
  const before = f.sqlite.prepare(`SELECT * FROM ${entry.table}`).all();
  assert.ok([200, 201].includes((await f.call(entry, 'POST', payload, 'alice', a)).status));
  assert.deepEqual(f.sqlite.prepare(`SELECT * FROM ${entry.table}`).all(), before);
  assert.equal(before[0].user_id, 'alice');
 });
 void test(`${entry.name}: owner intent cannot authorize B, missing auth, malformed scope or replace existing ID/CAS protections`, async t => {
  const f = await setup(t), payload = entry.value();
  const a = (await f.call(entry, 'GET')).data.ownerScope;
  const b = (await f.call(entry, 'GET', undefined, 'bob')).data.ownerScope;
  for (const invalid of ['', 'alice', 'owner-v1:bad']) {
   const response = await f.call(entry, 'POST', payload, 'alice', invalid);
   assert.equal(response.status, 409); assert.equal(response.data.code, 'OWNER_CHANGED');
  }
  assert.equal((await f.call(entry, 'POST', payload, null, a)).status, 401);
  assert.ok([200, 201].includes((await f.call(entry, 'POST', payload, 'alice', a)).status));
  assert.equal((await f.call(entry, 'POST', payload, 'bob', a)).data.code, 'OWNER_CHANGED');
  assert.equal((await f.call(entry, 'POST', payload, 'bob', b)).status, 409);
  // Existing non-recovering clients may omit the intent header. requestUser
  // remains authoritative and the existing global ID collision still fails.
  assert.equal((await f.call(entry, 'POST', payload, 'bob')).status, 409);
  const legacy = entry.value();
  assert.ok([200, 201].includes((await f.call(entry, 'POST', legacy, 'bob')).status));
  assert.equal(f.sqlite.prepare(`SELECT user_id FROM ${entry.table} WHERE id=?`).get(legacy.id).user_id, 'bob');
 });
}
void test('Coconala pending money stays with A and exact retry retains one receipt and revision', async t => {
 const f = await setup(t), entry = entries[2], payload = entry.value();
 const a = (await f.call(entry, 'GET')).data.ownerScope;
 await f.call(entry, 'POST', payload, 'alice', a);
 await f.call(entry, 'PATCH', {caseId:payload.id,revision:0,command:{id:randomUUID(),action:'assign'}}, 'alice', a);
 const command={caseId:payload.id,revision:1,command:{id:randomUUID(),action:'record_customer_receipt',amountYen:3000,reference:'synthetic-receipt-A'}};
 assert.equal((await f.call(entry,'PATCH',command,'alice',a)).status,200);
 assert.equal((await f.call(entry,'PATCH',command,null,a)).status,401);
 assert.equal((await f.call(entry,'PATCH',command,'bob',a)).data.code,'OWNER_CHANGED');
 assert.equal((await f.call(entry,'PATCH',command,'bob')).status,404);
 const replay=await f.call(entry,'PATCH',command,'alice',a); assert.equal(replay.status,200);
 assert.equal(replay.data.caseFile.customerReceipts.length,1); assert.equal(replay.data.caseFile.revision,2);
});
void test('Material workflow PATCH checks original owner intent before mutation and preserves CAS', async t => {
 const f = await setup(t), payload = entries[0].value();
 const a = (await f.call(entries[0], 'GET')).data.ownerScope;
 const saved = await f.call(entries[0], 'POST', payload, 'alice', a);
 const command = {jobId:payload.id,revision:saved.data.job.revision,command:{id:randomUUID(),action:'cancel'}};
 const route = {path:'work-jobs'};
 assert.equal((await f.call(route,'PATCH',command,'bob',a)).data.code,'OWNER_CHANGED');
 const result = await f.call(route,'PATCH',command,'alice',a);
 assert.equal(result.status,200); assert.equal(result.data.job.status,'cancelled');
 assert.deepEqual((await f.call(route,'PATCH',command,'alice',a)).data,result.data);
});
