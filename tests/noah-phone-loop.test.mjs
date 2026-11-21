import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteFixture } from './helpers/noah-remote-fixture.mjs';
const input=(connection,menu,name='read',values={})=>({id:crypto.randomUUID(),connectionId:connection.id,form:{tool:name,toolSha256:menu.find(t=>t.name===name).sha256,input:values},screen:'narrow'});
void test('phone: registry → list → plan → connect → three forms → Work without polling → disconnect retains results; no Mac rows',async t=>{
  const f=await remoteFixture(t);
  const list=await f.request('intake');assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].section,'new');
  const c=await f.connect();assert.equal(c.state,'connected');
  const menu=await f.request('tools',null,{id:c.id});assert.equal(menu.status,200);
  for(const [name,values,confirm] of [['read',{},false],['search',{query:'学びたいこと'},false],['review',{query:'確認した用事'},true]]){
    const body=input(c,menu.data.tools,name,values);if(confirm)body.form.confirm=true;
    const sent=await f.request('ask',body);assert.equal(sent.status,202,JSON.stringify(sent));
    await f.drain();
    const work=await f.works.get('alice',sent.data.workId);assert.equal(work.noahRemote.state,'returned');assert.equal(work.noahRemote.result.text,'Agentから受け取った成果');assert.equal(work.status,'review');assert.equal(work.steps[0].passed,false);
    assert.equal((await f.request('ask',null,{id:body.id})).data.result.text,work.noahRemote.result.text);
  }
  assert.equal(f.calls().length,3);assert.equal((await f.request('intake')).data.items[0].section,'ran');
  const latest=await f.request('connect',null,{id:c.id});assert.equal((await f.request('connect',{action:'disconnect',revision:latest.data.revision},{id:c.id})).data.state,'disconnected');
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM work_jobs').get().n,3);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_runner_devices').get().n,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM noah_runner_commands').get().n,0);
  for(const r of f.requests){assert.equal(r.headers.has('cookie'),false);assert.equal(r.headers.has('test-owner'),false);assert.equal(r.headers.has('x-rock-owner-scope'),false);assert.doesNotMatch(JSON.stringify(r.body),/alice/);}
});
void test('replayed/concurrent requests execute once; changed payload and other owner denied',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=await f.request('tools',null,{id:c.id}),body=input(c,menu.data.tools);
  const replies=await Promise.all([f.request('ask',body),f.request('ask',body),f.request('ask',body)]);await f.drain();
  assert.ok(replies.every(r=>[200,202].includes(r.status)),JSON.stringify(replies));assert.equal(f.calls().length,1);
  assert.equal((await f.request('ask',{...body,form:{...body.form,input:{x:1}}})).status,409);
  assert.equal((await f.request('ask',null,{id:body.id,owner:'bob'})).status,404);
  assert.equal((await f.request('tools',null,{id:c.id,owner:'bob'})).status,404);
  assert.equal((await f.request('ask',{...body,id:crypto.randomUUID()},{headers:{Origin:'https://other.example.com'}})).status,403);
});
void test('confirmation and tool-specific digest prevent changed or hidden arguments from being sent',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  for(const body of [input(c,menu,'review',{query:'hello'}),input(c,menu,'read',{unexpected:true})]){
    const res=await f.request('ask',body);assert.equal(res.status,202);await f.drain();assert.equal((await f.request('ask',null,{id:body.id})).data.state,'failed');
  }
  assert.equal(f.calls().length,0);
  f.state.tools[0].description='changed';const changed=input(c,menu);await f.request('ask',changed);await f.drain();assert.equal(f.calls().length,0);
  const unaffected=input(c,menu,'search',{query:'still valid'});await f.request('ask',unaffected);await f.drain();assert.equal(f.calls().length,1);
});
void test('stop during call discards late success; transport failure becomes unknown and is never retried',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  let release;const waiting=new Promise(r=>{release=r;});f.state.callHook=()=>waiting;
  const body=input(c,menu);await f.request('ask',body);
  for(let i=0;i<20&&!f.calls().length;i++)await new Promise(setImmediate);
  const running=await f.request('ask',null,{id:body.id});assert.equal(running.data.state,'running');
  await f.request('ask',{action:'stop',revision:running.data.revision},{id:body.id});release();await f.drain();
  const stopped=await f.request('ask',null,{id:body.id});assert.equal(stopped.data.state,'stopped');assert.equal(stopped.data.result,undefined);
  f.state.callHook=()=>{throw Error('lost connection');};const unknown=input(c,menu);await f.request('ask',unknown);await f.drain();assert.equal((await f.request('ask',null,{id:unknown.id})).data.state,'unknown');
  await f.request('ask',unknown);await f.drain();assert.equal(f.calls().length,2);
});
void test('flags, revocation, per-owner cap and Retry-After prevent outbound requests',async t=>{
  const f=await remoteFixture(t),c=await f.connect(),menu=(await f.request('tools',null,{id:c.id})).data.tools;
  f.deps.flags.askForm=false;assert.equal((await f.request('ask',input(c,menu))).status,503);f.deps.flags.intakePublic=false;assert.equal((await f.request('intake')).status,404);
  f.deps.flags.askForm=true;f.deps.flags.intakePublic=true;f.deps.flags.askLimits.perDay=1;
  const first=input(c,menu);await f.request('ask',first);await f.drain();assert.equal((await f.request('ask',input(c,menu))).status,429);f.deps.flags.askLimits.perDay=200;
  f.state.callStatus=429;const busy=input(c,menu);await f.request('ask',busy);await f.drain();const count=f.requests.length;
  assert.equal((await f.request('ask',input(c,menu))).status,429);assert.equal(f.requests.length,count);
  f.advance(120001);f.sql.prepare('UPDATE noah_intake_families SET withdrawn_at=?').run(f.time());
  assert.equal((await f.request('ask',input(c,menu))).status,409);assert.equal(f.requests.length,count);
});
