import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runtimeFixture } from './helpers/eve-runtime-fixture.mjs';

const legacyRequest=(f,p)=>({id:crypto.randomUUID(),threadId:crypto.randomUUID(),deviceId:f.device,
  agentId:p.agents[0].id,agentSha256:p.agents[0].sha256,modelSha256:p.models[0].sha256,input:'[合成] 旧形式の下書き',confirm:'run-on-pixel'});

void test('Native runtime then legacy synchronization retains both capability observations', async t => {
  const f=runtimeFixture(t), p=await f.announce();
  await f.legacy().presence(p,f.device);
  assert.equal((await f.legacy().devices()).length,1);
  assert.equal((await f.store().devices()).length,1,'Legacy presence must not erase the common runtime');
  await f.enqueue();await f.legacy().enqueue(legacyRequest(f,p));
  assert.equal((await f.store().pendingOwner()).length,1);
  assert.equal((await f.legacy().pending(f.device)).length,1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM eve_device_jobs').get().n,0,'Presence and pending commands never fabricate a result');
});

void test('Legacy then runtime synchronization retains the existing Pixel observation', async t => {
  const f=runtimeFixture(t), p=await f.announce();
  await f.legacy().presence(p,f.device);
  await f.store().presence(p,f.device);
  assert.equal((await f.store().devices()).length,1);
  assert.equal((await f.legacy().devices()).length,1,'Common runtime must not erase the legacy Pixel');
});

void test('Concurrent observations retain independent encrypted payloads and timestamps',async t=>{
  const f=runtimeFixture(t),p=await f.announce();
  await Promise.all(Array.from({length:8},(_,i)=>Promise.all([
    f.store().presence({...p,name:'Common '+i},f.device),
    f.legacy().presence({...p,name:'Legacy '+i},f.device),
  ])));
  assert.match((await f.store().devices())[0].name,/^Common /);
  assert.match((await f.legacy().devices())[0].name,/^Legacy /);
  const legacy=f.sql.prepare('SELECT * FROM eve_device_presence').get();
  await f.store().presence({...p,name:'Common final'},f.device);
  assert.deepEqual(f.sql.prepare('SELECT * FROM eve_device_presence').get(),legacy);
  for(const table of ['eve_device_presence','eve_runtime_presence']){
    const row=f.sql.prepare('SELECT * FROM '+table).get();assert.equal(row.envelope.includes('合成の担当'),false);
    assert.equal(row.owner_id,'alice');assert.equal(row.device_id,f.device);
  }
});

void test('Runtime stop and stale observations cannot borrow readiness from legacy sync',async t=>{
  const f=runtimeFixture(t),p=await f.announce();await f.legacy().presence(p,f.device);
  await f.store().presence({...p,phase:'stopped'},f.device);
  assert.equal((await f.legacy().devices())[0].phase,'ready');
  await assert.rejects(f.enqueue(),e=>e.message==='RUNTIME_NOT_READY'&&e.status===409);
  await f.legacy().enqueue(legacyRequest(f,p));
  await f.store().presence(p,f.device);f.sql.prepare('UPDATE eve_runtime_presence SET updated_at=0').run();
  await assert.rejects(f.enqueue(),e=>e.message==='RUNTIME_NOT_READY'&&e.status===409);
  assert.equal((await f.store().pendingOwner()).length,0);
  await f.store().presence(p,f.device);await f.legacy().presence({...p,phase:'stopped'},f.device);
  await f.enqueue();await assert.rejects(f.legacy().enqueue(legacyRequest(f,p)),e=>e.status===409);
});

void test('Both observation surfaces remain owner scoped and hidden after grant revocation',async t=>{
  const f=runtimeFixture(t),p=await f.announce();await f.legacy().presence(p,f.device);
  assert.deepEqual(await f.store('bob').devices(),[]);assert.deepEqual(await f.legacy('bob').devices(),[]);
  await assert.rejects(f.store('bob').presence(p,f.device),e=>e.status===401);
  f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();
  assert.deepEqual(await f.store().devices(),[]);assert.deepEqual(await f.legacy().devices(),[]);
  await assert.rejects(f.store().presence(p,f.device),e=>e.status===401);
  await assert.rejects(f.enqueue());await assert.rejects(f.legacy().enqueue(legacyRequest(f,p)));
});

void test('Purpose-bound encryption rejects ciphertext copied between runtime and legacy tables',async t=>{
  const f=runtimeFixture(t),p=await f.announce();await f.legacy().presence(p,f.device);
  const runtime=f.sql.prepare('SELECT envelope FROM eve_runtime_presence').get().envelope;
  const legacy=f.sql.prepare('SELECT envelope FROM eve_device_presence').get().envelope;
  f.sql.prepare('UPDATE eve_runtime_presence SET envelope=?').run(legacy);
  await assert.rejects(f.store().devices());
  f.sql.prepare('UPDATE eve_runtime_presence SET envelope=?').run(runtime);
  f.sql.prepare('UPDATE eve_device_presence SET envelope=?').run(runtime);
  await assert.rejects(f.legacy().devices());assert.equal((await f.store().devices()).length,1);
});

void test('Additive migration preserves old encrypted observations without promoting them to a runtime',async t=>{
  const f=runtimeFixture(t),p=await f.announce();await f.legacy().presence(p,f.device);
  const before=f.sql.prepare('SELECT * FROM eve_device_presence').get();
  f.sql.exec('DROP TABLE eve_runtime_presence');
  const sql=readFileSync(new URL('../drizzle/0032_eve_runtime_presence.sql',import.meta.url),'utf8');
  f.sql.exec(sql);f.sql.exec(sql);
  assert.deepEqual(f.sql.prepare('SELECT * FROM eve_device_presence').get(),before);
  assert.deepEqual(await f.store().devices(),[]);assert.equal((await f.legacy().devices()).length,1);
  await f.store().presence(p,f.device);assert.equal((await f.store().devices()).length,1);
  assert.equal((await f.legacy().devices()).length,1);
});
