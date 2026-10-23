import test from 'node:test';
import assert from 'node:assert/strict';
import {purposeFixture} from './helpers/eve-purpose-fixture.mjs';
import {createEveInteractionSession} from '../lib/rockstar-eve-interaction.ts';
import {createPurposeRuntimeEveWorkPort,draftEvePurposeRole} from '../lib/eve-purpose-runtime-work-port.ts';
void test('confirmed arbitrary purpose creates one personal role, registers it and executes in the same common session and account history',async t=>{
 const f=await purposeFixture(t),work=f.port(),session=createEveInteractionSession({work,pendingKey:f.pendingKey,storage:f.storage,changed:()=>{}});
 session.arm();session.hearFinal('Hey Eve');session.hearFinal('来週の出張で使う持ち物の確認文を作る');await session.confirm();assert.equal(session.state.phase,'running');
 const id=session.state.jobId,role=[...f.library.values()][0];assert.match(role.instructions,/来週の出張/);assert.equal(f.counts.libraryWrites,1);assert.equal(f.counts.preparationWrites,1);assert.equal(f.counts.runtimeStarts,1);
 const entry=(await f.store().commands(f.device)).find(e=>e.command.request.id===id);assert.equal(entry.command.request.agent.id,role.id);assert.equal(entry.command.request.threadId,f.binding.threadId);
 const report=await f.report(entry);await f.store().publish(f.device,{report,revision:0});await session.refresh();assert.equal(session.state.phase,'result');assert.equal(session.state.result,report.text);
 await session.stop();assert.equal(session.state.phase,'standby');assert.equal((await f.store().inspectOwnerRequest(id)).execution.externalToolSuccess,false);assert.equal(f.data.size,0);
});
void test('lost library response and lost queue response recover original IDs without repeated mutations',async t=>{
 for(const loss of ['loseLibrary','loseQueue']){
  const f=await purposeFixture(t),input='好きな文章の推敲を任せる';f[loss]();await assert.rejects(f.port().prepare(input,()=>true));const original=[...f.library.keys()][0];
  const prepared=await f.port().prepare(input,()=>true);assert.equal(prepared.agentId,original);assert.equal(f.counts.libraryWrites,1);assert.equal(f.counts.preparationWrites,1);assert.equal(f.counts.runtimeStarts,0);
 }
});
void test('thread-scoped server recovery reuses a registered role after client preparation storage is gone',async t=>{
 const f=await purposeFixture(t),input='自分の園芸記録を読みやすく整える';const first=await f.port().prepare(input,()=>true);assert.equal(f.data.size,0);
 const second=await f.port().prepare(input,()=>true);assert.deepEqual(second,first);assert.equal(f.counts.libraryWrites,1);assert.equal(f.counts.preparationWrites,1);assert.equal(f.counts.runtimeStarts,0);
});
void test('stop during preparation fences registration and never sends a runtime start',async t=>{
 const f=await purposeFixture(t);f.disableHost();let entered,release;const gate=new Promise(resolve=>{release=resolve;}),began=new Promise(resolve=>{entered=resolve;});
 const work=createPurposeRuntimeEveWorkPort({...f.options,sleep:async()=>{entered();await gate;}}),session=createEveInteractionSession({work,pendingKey:f.pendingKey,storage:f.storage,changed:()=>{}});
 session.arm();session.hearFinal('Hey Eve');session.hearFinal('自由な目的を担当に任せる');const preparing=session.confirm();await began;const stopped=session.stop();release();await preparing;await stopped;
 assert.equal(session.state.phase,'standby');assert.equal(f.counts.runtimeStarts,0);assert.equal(f.sql.prepare('SELECT state FROM eve_device_commands').get().state,'agent-prepare-cancelled');assert.equal(f.data.size,0);
});
void test('unavailable storage, retired context and changed personal settings cannot start execution',async t=>{
 const f=await purposeFixture(t),input='文章を整理する';const unavailable=createPurposeRuntimeEveWorkPort({...f.options,storage:{...f.storage,setItem:()=>{throw Error('storage denied');}}});await assert.rejects(unavailable.prepare(input,()=>true));assert.equal(f.counts.libraryWrites,0);
 const prepared=await f.port().prepare(input,()=>true),reference={id:crypto.randomUUID(),...prepared};f.library.get(reference.agentId).enabled=false;await assert.rejects(f.port().start(reference));assert.equal(f.counts.runtimeStarts,0);
 f.retire();await assert.rejects(f.port().prepare(input,()=>true));
});
void test('purpose role is bounded, preserves graphemes, and has no authority fields',()=>{
 const role=draftEvePurposeRole('👨‍👩‍👧‍👦'.repeat(20)+'についてまとめる','test-model');assert.ok(role.name.length<=80);assert.ok(role.instructions.length<=1200);assert.deepEqual(Object.keys(role),['name','instructions','modelId']);assert.match(role.instructions,/OS権限/);
 assert.throws(()=>draftEvePurposeRole('x'.repeat(1001),'test-model'));assert.throws(()=>draftEvePurposeRole('','test-model'));
});

void test('first purpose can create the first role, while incomplete recovery and changed owner never start work',async t=>{
 const f=await purposeFixture(t);await f.clearInitialAgents();const prepared=await f.port().prepare('初めての担当で自由な目的を進める',()=>true);assert.ok(prepared.agentId);assert.equal(f.library.size,1);
 f.setOwner('bob');await assert.rejects(f.port().start({id:crypto.randomUUID(),...prepared}));assert.equal(f.counts.runtimeStarts,0);
 const g=await purposeFixture(t),incomplete=createPurposeRuntimeEveWorkPort({...g.options,api:async(path,init)=>path.includes('preparationThreadId=')?{ownerUserId:g.binding.owner,threadId:g.binding.threadId,preparations:[],hasMore:true}:g.options.api(path,init)});
 await assert.rejects(incomplete.prepare('過去の登録を失わずに作る',()=>true));assert.equal(g.counts.libraryWrites,0);assert.equal(g.counts.preparationWrites,0);
});
