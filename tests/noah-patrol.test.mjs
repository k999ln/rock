import test from 'node:test';
import assert from 'node:assert/strict';
import {remoteFixture} from './helpers/noah-remote-fixture.mjs';
import {remoteCandidate} from '../lib/noah-remote-candidate.ts';
import {recoverNoahRemote} from '../lib/noah-remote-recovery.ts';
import {createNoahRemoteWork} from '../lib/noah-remote-work.ts';

void test('regrouped bulk candidates are never probed through their retained singleton rows',async t=>{
  const f=await remoteFixture(t,{probe:false});
  const candidate=f.sql.prepare('SELECT * FROM noah_intake_candidates').get();
  const check=f.sql.prepare('SELECT * FROM noah_intake_checks').get();
  const family=f.sql.prepare('SELECT * FROM noah_intake_families').get();
  const insert=(table,row)=>{const keys=Object.keys(row);f.sql.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...Object.values(row));};
  for(let i=1;i<20;i++){
    const id=`mcp-registry:test.provider/phone-agent-${i}`;
    insert('noah_intake_candidates',{...candidate,id,external_key:`test.provider/phone-agent-${i}`,family_id:id});
    insert('noah_intake_checks',{...check,candidate_id:id});
    insert('noah_intake_families',{...family,id,representative_id:id});
  }
  f.sql.prepare("UPDATE noah_intake_sources SET lease_id='test-bulk',lease_until=?").run(f.time()+60000);
  await f.store.regroup('test-bulk');
  assert.equal(f.sql.prepare("SELECT count(*) n FROM noah_intake_candidates WHERE family_id LIKE 'bulk:%'").get().n,20);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM noah_intake_families WHERE id NOT LIKE 'bulk:%' AND hidden_at IS NOT NULL").get().n,20);
  assert.deepEqual(await f.store.probeDue(),[]);
  assert.equal(f.requests.length,0);
  assert.equal(f.sql.prepare('SELECT count(*) n FROM noah_probe_hosts').get().n,0);
});

void test('patrol separates provider health from user success; repeated success cannot bump ranking',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  assert.ok(menu.every(tool=>tool.form?.usable));
  const ask=()=>f.request('ask',{id:crypto.randomUUID(),connectionId:c.id,form:{tool:'read',toolSha256:menu[0].sha256,input:{}}});
  await ask();await f.drain();const first=await remoteCandidate(f.db,f.family);
  f.advance(6000);await ask();await f.drain();const second=await remoteCandidate(f.db,f.family);
  assert.equal(second.l2_at,first.l2_at);assert.equal(second.checked_at,first.checked_at);
  f.state.status=500;await f.store.probeL1(second);let health=await remoteCandidate(f.db,f.family);
  assert.equal(health.level,2);assert.equal(health.next_check_at-f.time(),6*3600000);
  f.advance(6*3600000);await f.store.probeL1(health);health=await remoteCandidate(f.db,f.family);
  assert.equal(health.level,0);assert.equal(health.next_check_at-f.time(),14*86400000);assert.equal((await f.request('intake')).data.items.length,0);
  assert.equal((await f.request('connect',null,{id:c.id})).data.state,'connected');
  f.state.status=0;await f.store.probeL1(health);health=await remoteCandidate(f.db,f.family);assert.equal(health.level,1);assert.equal(health.next_check_at-f.time(),86400000);
  assert.equal((await f.request('intake')).data.items[0].section,'new');
});
void test('patrol backs off on 429 without downgrading, suppresses duplicate host handshakes and skips withdrawn families',async t=>{
  const f=await remoteFixture(t);const count=f.requests.length;await f.store.probeDue();assert.equal(f.requests.length,count);
  f.state.status=429;await f.store.probeL1(await remoteCandidate(f.db,f.family));const row=await remoteCandidate(f.db,f.family);assert.equal(row.failures,0);assert.equal(row.level,1);
  assert.equal(f.sql.prepare('SELECT not_before FROM noah_probe_hosts').get().not_before,f.time()+120000);
  const requests=f.requests.length;await f.store.probeDue();assert.equal(f.requests.length,requests);
  f.advance(31*86400000);f.sql.prepare('UPDATE noah_intake_families SET withdrawn_at=?').run(f.time());await f.store.probeDue();assert.equal(f.requests.length,requests);
});
void test('recovery expires lost work and connections without outbound calls; late completion cannot overwrite unknown',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  let release;f.state.callHook=()=>new Promise(r=>{release=r;});
  const id=crypto.randomUUID();await f.request('ask',{id,connectionId:c.id,form:{tool:'read',toolSha256:menu[0].sha256,input:{}}});
  for(let i=0;i<20&&!release;i++)await new Promise(setImmediate);
  f.advance(30001);const count=f.requests.length;await recoverNoahRemote(f.deps);assert.equal(f.requests.length,count);
  assert.equal((await f.request('ask',null,{id})).data.state,'unknown');assert.equal((await f.works.get('alice',id)).noahRemote.state,'unknown');
  release();await f.drain();assert.equal((await f.request('ask',null,{id})).data.state,'unknown');
  const queued=crypto.randomUUID(),at=f.time()-61000;const work=createNoahRemoteWork(queued,{connectionId:c.id,familyKey:f.family,digest:'a'.repeat(64),prompt:'read',inputSha256:'a'.repeat(64),toolsSha256:menu[0].sha256},at);
  f.sql.prepare('INSERT INTO work_jobs VALUES(?,?,?,?,?)').run(queued,'alice',JSON.stringify(work),0,work.updatedAt);
  f.sql.prepare("INSERT INTO noah_asks(id,owner_id,connection_id,work_id,request_sha256,mode,host,tool,tool_sha256,state,revision,created_at,updated_at) VALUES(?,?,?,?,?,'form',?,'read',?,'queued',1,?,?)").run(queued,'alice',c.id,queued,'a'.repeat(64),c.host,menu[0].sha256,at,at);
  await recoverNoahRemote(f.deps);assert.equal((await f.request('ask',null,{id:queued})).data.state,'failed');
  f.sql.prepare("UPDATE noah_connections SET state='probing',updated_at=? WHERE id=?").run(f.time()-31000,c.id);
  await recoverNoahRemote(f.deps);assert.equal((await f.request('connect',null,{id:c.id})).data.state,'disconnected');
});
void test('401 removes listing without reading OAuth metadata; malformed tool result never becomes success',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  f.state.callResult={};const id=crypto.randomUUID();await f.request('ask',{id,connectionId:c.id,form:{tool:'read',toolSha256:menu[0].sha256,input:{}}});await f.drain();assert.equal((await f.request('ask',null,{id})).data.state,'unknown');
  f.advance(6000);f.state.status=401;const res=await f.request('tools',null,{id:c.id});assert.equal(res.status,409);assert.equal((await f.request('intake')).data.items.length,0);
  assert.ok(f.requests.every(r=>new URL(r.url).hostname==='phone.example.com'));
});
