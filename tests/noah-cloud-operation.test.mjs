import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { AGENT_ID, MANIFEST_SHA256, OWNER_SCOPE, newState, sha256, start, tick, view } from '../services/noah-test-runtime/src/protocol.mjs';
import { connectNoahCloud } from '../scripts/noah-cloud-bridge.mjs';

const bundled = await build({ entryPoints: ['services/noah-test-runtime/src/worker.mjs'], bundle: true, format: 'esm', write: false, loader: { '.html': 'text' } });
const script = bundled.outputFiles[0].text;
const { NoahTestOperation } = await import(`data:text/javascript;base64,${Buffer.from(script).toString('base64')}`);
const input = () => ({ requestId: randomUUID(), text: ' a \nb\na', intervalSeconds: 60 });
const fingerprint = value => sha256(JSON.stringify([value.text, value.intervalSeconds]));

class Store {
  data = new Map(); alarm = null; queue = Promise.resolve(); fail = false;
  transaction(callback) {
    const result = this.queue.catch(() => {}).then(async () => {
      const data = structuredClone(this.data); let alarm = this.alarm;
      const tx = { get: async k => structuredClone(data.get(k)), put: async (k,v) => { assert.ok(Buffer.byteLength(JSON.stringify(v)) < 128 * 1024); data.set(k,structuredClone(v)); }, delete: async k => data.delete(k), getAlarm: async () => alarm, setAlarm: async v => { alarm = v; }, deleteAlarm: async () => { alarm = null; } };
      const value = await callback(tx);
      if (this.fail) { this.fail = false; throw new Error('Storage commit failed'); }
      this.data = data; this.alarm = alarm; return value;
    }); this.queue = result; return result;
  }
}
async function fixture() {
  const storage = new Store(), agent = new NoahTestOperation({ storage });
  storage.data.set('auth', { pairs: [], sessions: [{ hash: 'owner', expiresAt: Date.now() + 100000 }] });
  const call = (action, payload = {}, sessionHash = 'owner') => agent.fetch(new Request('https://internal/command', { method: 'POST', body: JSON.stringify({ action, input: payload, sessionHash }) }));
  return { storage, agent, call };
}

await test('cloud model: idempotent start, old retries cannot restart, bounded history, no catch-up', async () => {
  const state = newState(), first = input(), fp = await fingerprint(first);
  assert.equal(start(state, first, 100, fp), true); assert.equal(start(state, first, 100, fp), false);
  assert.throws(() => start(state, { ...first, text: 'different' }, 100, 'b'.repeat(64)), /使用済み/);
  assert.throws(() => start(state, input(), 100, fp), /運用中/);
  assert.equal(tick(state, 100), false); assert.equal(tick(state, 101), true); assert.equal(tick(state, 101), false);
  assert.deepEqual(state.runs[0].result, { text: 'a\nb', inputLines: 3, uniqueLines: 2, removedLines: 1 });
  tick(state, 6000000); assert.equal(state.operation.succeededCount, 2); assert.equal(state.operation.nextRunAt, 6060000);
  for (let i = 0; i < 30; i++) tick(state, state.operation.nextRunAt);
  assert.equal(state.runs.length, 20); assert.equal(view(state, state.operation.nextRunAt + 90001).health, 'delayed');
  state.operation.state = 'stopped'; assert.equal(start(state, first, 9000000, fp), false);
  assert.equal(tick(state, 9000000), false); start(state, input(), 9000000, fp);
  assert.throws(() => start(state, first, 9000001, fp), /使用済み/);
});

await test('cloud model rejects arbitrary fields, intervals, blank/large input and storage limit', async () => {
  const good = input(), fp = await fingerprint(good);
  for (const bad of [{ ...good, command: 'shell' }, { ...good, intervalSeconds: 1 }, { ...good, text: '' }, { ...good, text: 'a'.repeat(4001) }, { ...good, requestId: '__proto__' }]) assert.throws(() => start(newState(), bad, 1, fp));
  const state = newState(); state.starts = Object.fromEntries(Array.from({length:1000},()=>[randomUUID(),fp]));
  assert.throws(() => start(state, good, 1, fp), /上限/);
});

await test('DO: atomic result/alarm, storage rollback, retry, eviction, stop and late redelivery', async () => {
  const { storage, agent, call } = await fixture();
  const first = input(); assert.equal((await call('start', first)).status, 200);
  assert.equal((await call('start',null)).status,400);
  await new Promise(r => setTimeout(r, 5));
  storage.fail = true; await assert.rejects(agent.alarm());
  assert.equal(storage.data.get('state').operation.succeededCount, 0);
  const restored = new NoahTestOperation({ storage }); await restored.alarm();
  assert.equal(storage.data.get('state').operation.succeededCount, 1);
  await restored.alarm(); assert.equal(storage.data.get('state').operation.succeededCount, 1);
  assert.equal(storage.alarm, storage.data.get('state').operation.nextRunAt);
  const result = await (await call('status')).json(); assert.equal(result.runs[0].result.text, 'a\nb');
  await call('stop'); assert.equal(storage.alarm, null);
  await restored.alarm(); assert.equal(storage.data.get('state').operation.succeededCount, 1);
  assert.equal((await (await call('start', first)).json()).operation.state, 'stopped');
});

await test('DO: stop race drains atomically and failed stop never reports stopped', async () => {
  const { storage, agent, call } = await fixture(); await call('start', input()); await new Promise(r=>setTimeout(r,5));
  await Promise.all([agent.alarm(), call('stop')]);
  const state = storage.data.get('state'); assert.equal(state.operation.state,'stopped'); assert.equal(storage.alarm,null);
  await agent.alarm(); assert.equal(storage.data.get('state').operation.succeededCount,state.operation.succeededCount);
  await call('start',input()); storage.fail=true; assert.equal((await call('stop')).status,503);
  assert.equal(storage.data.get('state').operation.state,'running');
  await call('stop');
  const late=input();await call('stop',{cancelStartId:late.requestId});assert.equal((await call('start',late)).status,409);
  assert.equal(storage.data.get('state').operation.state,'stopped');
});

await test('DO: owner session, expired/consumed pair codes, session logout, scheduled work independent of login', async () => {
  const {storage,agent,call}=await fixture();
  assert.equal((await call('status',{},'stranger')).status,401);
  assert.equal((await call('pair',{hash:'code'})).status,200);
  assert.equal((await call('exchange',{hash:'code',sessionHash:'new'})).status,200);
  assert.equal((await call('exchange',{hash:'code',sessionHash:'other'})).status,401);
  await call('pair',{hash:'expired'}); storage.data.get('auth').pairs[0].expiresAt=0;
  assert.equal((await call('exchange',{hash:'expired',sessionHash:'other'})).status,401);
  await call('start',input(),'new'); await call('logout',{},'new'); assert.equal((await call('status',{},'new')).status,401);
  await new Promise(r=>setTimeout(r,5));await agent.alarm(); assert.equal(storage.data.get('state').operation.succeededCount,1);
});

await test('DO: watchdog restores only missing active alarm; bounded Unicode results and credential storage', async () => {
  const { storage,agent,call }=await fixture();await call('start',{...input(),text:'亜'.repeat(3998)});
  storage.alarm=null; await call('reconcile');assert.ok(storage.alarm);
  for(let i=0;i<25;i++){storage.data.get('state').operation.nextRunAt=Date.now()-1;await agent.alarm()}
  assert.equal(storage.data.get('state').runs.length,20);assert.equal([...storage.data.keys()].filter(k=>k.startsWith('result:')).length,20);
  assert.equal((await (await call('status')).json()).runs[0].result.text.length,3998);
  await call('stop');await call('reconcile');assert.equal(storage.alarm,null);
  for(let i=0;i<8;i++)assert.equal((await call('pair',{hash:`pair${i}`})).status,200);
  assert.equal((await call('pair',{hash:'limit'})).status,429);
});

await test('real Workers runtime: private HTTP boundary, alarm execution, persistent reopen, stop and logout', {timeout:45000}, async () => {
  const directory=await mkdtemp(path.join(tmpdir(),'noah-cloud-mf-'));
  const options={script,modules:true,compatibilityDate:'2026-10-01',durableObjects:{OPERATIONS:{className:'NoahTestOperation',useSQLite:true}},durableObjectsPersist:directory,bindings:{NOAH_BRIDGE_SECRET:'test-secret'}};
  const persistentOptions={...convertV4MiniflareOptions(options),resourcePersistencePath:directory,isolatedResourcePersistencePath:directory};
  let mf=new Miniflare(persistentOptions);
  const origin='https://noah.example';
  const req=(url,data,extra={})=>mf.dispatchFetch(origin+url,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});
  try {
    assert.equal((await req('/api/operation')).status,401);
    assert.equal((await req('/api/pair',{ownerScope:OWNER_SCOPE,agentId:AGENT_ID})).status,401);
    assert.equal((await req('/api/pair',{ownerScope:'foreign',agentId:AGENT_ID},{Authorization:'Bearer test-secret'})).status,403);
    const pair=await (await req('/api/pair',{ownerScope:OWNER_SCOPE,agentId:AGENT_ID},{Authorization:'Bearer test-secret'})).json();
    const code=new URL(pair.url).hash.slice('#connect='.length);
    assert.equal((await req('/auth/exchange',{code},{Origin:'https://evil.example'})).status,403);
    const exchange=await req('/auth/exchange',{code});assert.equal(exchange.status,200);
    assert.match(exchange.headers.get('set-cookie'),/Secure; HttpOnly; SameSite=Strict/);
    const Cookie=exchange.headers.get('set-cookie').split(';')[0];
    assert.equal((await req('/auth/exchange',{code})).status,401);
    assert.equal((await req('/api/operation/start',input(),{Cookie,Origin:'https://evil.example'})).status,403);
    assert.equal((await req('/api/operation/stop',{}, {Cookie,'Sec-Fetch-Site':'cross-site'})).status,403);
    assert.equal((await req('/api/operation/start',{...input(),text:'x'.repeat(21000)},{Cookie})).status,413);
    const first=input();assert.equal((await req('/api/operation/start',first,{Cookie})).status,200);
    await new Promise(r=>setTimeout(r,1200));
    const before=await (await req('/api/operation',undefined,{Cookie})).json();
    assert.equal(before.operation.succeededCount,1); assert.equal(before.runs[0].result.text,'a\nb');
    await mf.dispose(); mf=new Miniflare(persistentOptions);
    const restoredResponse=await req('/api/operation',undefined,{Cookie});const restored=await restoredResponse.json();assert.equal(restoredResponse.status,200,JSON.stringify(restored));assert.equal(restored.operation.id,first.requestId);assert.equal(restored.operation.state,'running');assert.equal(restored.operation.succeededCount,1);
    assert.equal((await req('/api/operation/start',first,{Cookie})).status,200);
    assert.equal((await req('/api/operation/start',input(),{Cookie})).status,409);
    assert.equal((await req('/api/operation/stop',{}, {Cookie})).status,200);
    assert.equal((await (await req('/api/operation',undefined,{Cookie})).json()).operation.state,'stopped');
    await req('/auth/logout',{}, {Cookie});assert.equal((await req('/api/operation',undefined,{Cookie})).status,401);
    const page=await req('/');assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  } finally {await mf.dispose();await rm(directory,{recursive:true,force:true})}
});

await test('cloud bridge verifies owner/definition and never exposes management credential', async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'noah-cloud-bridge-')), file=path.join(directory,'config.json');
  const context={ownerScope:OWNER_SCOPE,agent:{id:AGENT_ID,manifestSha256:MANIFEST_SHA256,uploadState:'ready'}};
  try{
    await assert.rejects(connectNoahCloud({...context,ownerScope:'stranger'},file),/専用/);
    await assert.rejects(connectNoahCloud({...context,agent:{...context.agent,manifestSha256:'changed'}},file),/専用/);
    await assert.rejects(connectNoahCloud(context,file),/設定/);
    const config={origin:'https://avokado-noah-test-runtime.example.workers.dev',secret:'a'.repeat(64)};await writeFile(file,JSON.stringify(config),{mode:0o600});
    const result=await connectNoahCloud(context,file,async(url,init)=>{assert.equal(url,config.origin+'/api/pair');assert.equal(init.headers.Authorization,'Bearer '+config.secret);assert.equal(init.redirect,'error');return Response.json({url:`${config.origin}/noah/agents/${AGENT_ID}#connect=${'b'.repeat(64)}`,expiresAt:Date.now()+300000})});
    assert.equal(JSON.stringify(result).includes(config.secret),false);
    await assert.rejects(connectNoahCloud(context,file,async()=>Response.json({url:'https://evil.example'})),/応答/);
  }finally{await rm(directory,{recursive:true,force:true})}
});
