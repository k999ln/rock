import test from 'node:test';
import assert from 'node:assert/strict';
import { createEveInteractionSession, EVE_INTERACTION_PENDING } from '../lib/rockstar-eve-interaction.ts';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};};
function host() {
  let reference=null,status='running',starts=0,stops=0;
  const work={async prepare(input,continuing){return continuing()?{agentId:'existing-agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input}:null;},async start(value){reference={...value};starts++;return {status,text:null};},async read(value){assert.deepEqual(value,reference);return {status,text:status==='review'?'共通の成果':null};},async stop(value){assert.deepEqual(value,reference);stops++;status='stopped';return {status,text:null};}};
  work.stopExisting=value=>work.stop(value);
  return {work,get starts(){return starts;},get stops(){return stops;},finish(){status='review';}};
}
void test('different host adapters use the identical wake/review/execute/result/standby transitions',async()=>{
 const traces=[];
 for(const adapter of ['synthetic-pixel','synthetic-mini']){
  const h=host(),trace=[],saved=storage();const s=createEveInteractionSession({work:h.work,storage:saved,changed:v=>trace.push(v.phase)});
  s.arm();s.hearFinal('Hey Eve');s.hearFinal('文章を作る');assert.equal(h.starts,0);await s.confirm();assert.equal(h.starts,1);assert.ok(saved.getItem(EVE_INTERACTION_PENDING));
  h.finish();await s.refresh();assert.equal(s.state.result,'共通の成果');await s.stop();assert.equal(s.state.phase,'standby');assert.equal(h.stops,0);assert.equal(saved.getItem(EVE_INTERACTION_PENDING),null);traces.push({adapter,trace});
 }
 assert.deepEqual(traces[0].trace,traces[1].trace);
});
void test('all hosts require an exact prepared reference, so an adapter cannot substitute the job ID',async()=>{
 const h=host();h.work.prepare=async input=>({id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input});const s=createEveInteractionSession({work:h.work,storage:storage(),changed(){}});s.arm();s.hearFinal('Hey Eve');s.hearFinal('依頼');await s.confirm();assert.equal(s.state.phase,'review');assert.equal(h.starts,0);
});
void test('input-off requests use the same scoped stop receipt and do not erase saved outcomes',async()=>{
 const h=host(),s=createEveInteractionSession({work:h.work,storage:storage(),changed(){}});s.arm();s.hearFinal('Hey Eve');s.hearFinal('依頼');await s.confirm();await s.stop(true);assert.equal(s.state.phase,'disabled');assert.equal(h.stops,1);
});
void test('a stop confirmed through another input clears the same pending handle before the next wake',async()=>{
 const h=host(),saved=storage(),s=createEveInteractionSession({work:h.work,storage:saved,changed(){}});s.arm();s.hearFinal('Hey Eve');s.hearFinal('依頼');await s.confirm();
 h.work.read=async()=>({status:'stopped',text:null});await s.refresh();assert.equal(s.state.phase,'standby');assert.equal(saved.getItem(EVE_INTERACTION_PENDING),null);
 s.hearFinal('Hey Eve');s.hearFinal('次の依頼');await s.confirm();assert.equal(h.starts,2);
});

void test('missing delivery invokes same-ID stop but never clears an unconfirmed handle',async()=>{
 const h=host(),saved=storage();h.work.start=async value=>{h.reference=value;return null;};h.work.read=async()=>null;
 let stopped=0;h.work.stop=async reference=>{stopped++;assert.equal(reference.id,h.reference.id);return null;};
 const session=createEveInteractionSession({work:h.work,storage:saved,changed(){}});session.arm();session.hearFinal('Hey Eve');session.hearFinal('依頼');await session.confirm();
 await session.stop();assert.equal(stopped,1);assert.equal(session.state.phase,'unknown');assert.ok(saved.getItem(EVE_INTERACTION_PENDING));
});

void test('another client reads the same saved job without prepare, start or ID replacement',async()=>{
 const h=host(),first=storage(),a=createEveInteractionSession({work:h.work,storage:first,changed(){}});
 a.arm();a.hearFinal('Hey Eve');a.hearFinal('既存の依頼');await a.confirm();
 const {knownExisting,...reference}=JSON.parse(first.getItem(EVE_INTERACTION_PENDING)),second=storage();assert.equal(knownExisting,true);
 h.work.prepare=async()=>{throw Error('must not prepare');};h.work.start=async()=>{throw Error('must not start');};
 const b=createEveInteractionSession({work:h.work,storage:second,changed(){}});await b.resume(reference);
 assert.equal(b.state.phase,'running');assert.equal(b.state.jobId,a.state.jobId);assert.deepEqual(JSON.parse(second.getItem(EVE_INTERACTION_PENDING)),{...reference,knownExisting:true});assert.equal(h.starts,1);
 await b.stop();assert.equal(b.state.phase,'standby');assert.equal(h.stops,1);await a.refresh();assert.equal(a.state.phase,'standby');
});
void test('resume preserves a different or corrupt saved handle and does not read it',async()=>{
 const reference={id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input:'既存'};
 for(const raw of ['invalid',JSON.stringify({...reference,id:crypto.randomUUID()}),JSON.stringify({...reference,extra:true})]){
  const saved=storage();saved.setItem(EVE_INTERACTION_PENDING,raw);let reads=0;
  const h=host();h.work.read=async()=>{reads++;return null;};const s=createEveInteractionSession({work:h.work,storage:saved,changed(){}});
  await s.resume(reference);assert.equal(s.state.phase,'unknown');assert.equal(reads,0);assert.equal(saved.getItem(EVE_INTERACTION_PENDING),raw);
 }
});
void test('stop during a resume read waits for the same job and ignores late running state',async()=>{
 const reference={id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input:'既存'};
 const saved=storage();let release,reads=0,stops=0;const deferred=new Promise(r=>{release=r;});
 const work={prepare:async()=>{throw Error('no prepare');},start:async()=>{throw Error('no start');},read:async ref=>{assert.deepEqual(ref,reference);reads++;return reads===1?deferred:{status:'running',text:null};},stop:async ref=>{assert.deepEqual(ref,reference);stops++;return {status:'stopped',text:null};}};
 work.stopExisting=ref=>work.stop(ref);
 const s=createEveInteractionSession({work,storage:saved,changed(){}});const adopting=s.resume(reference);assert.equal(s.state.jobId,reference.id);
 const stopping=s.stop();assert.equal(s.state.phase,'stopping');release({status:'running',text:null});await Promise.all([adopting,stopping]);assert.equal(s.state.phase,'standby');assert.equal(stops,1);assert.equal(saved.getItem(EVE_INTERACTION_PENDING),null);
});

void test('known-existing records survive reload and missing reads never use the legacy stop',async()=>{
 const reference={id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input:'保存済み'};const saved=storage();let legacy=0,existing=0;
 const work={prepare:async()=>null,start:async()=>null,read:async ref=>{assert.deepEqual(ref,reference);return null;},stop:async()=>{legacy++;return {status:'stopped',text:null};},stopExisting:async()=>{existing++;return null;}};
 const first=createEveInteractionSession({work,storage:saved,changed(){}});await first.resume(reference);assert.equal(first.state.phase,'unknown');assert.equal(JSON.parse(saved.getItem(EVE_INTERACTION_PENDING)).knownExisting,true);await first.stop();assert.equal(first.state.phase,'unknown');
 const restored=createEveInteractionSession({work,storage:saved,changed(){}});restored.arm();await restored.stop();assert.equal(restored.state.phase,'unknown');assert.equal(restored.state.jobId,reference.id);assert.equal(legacy,0);assert.equal(existing,0);assert.ok(saved.getItem(EVE_INTERACTION_PENDING));
});
void test('unsupported existing-stop adapters and invalid provenance retain the original handle',async()=>{
 const reference={id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input:'保存済み'};let stopped=0;
 const work={prepare:async()=>null,start:async()=>null,read:async()=>({status:'running',text:null}),stop:async()=>{stopped++;return {status:'stopped',text:null};}};
 const saved=storage(),s=createEveInteractionSession({work,storage:saved,changed(){}});await s.resume(reference);await s.stop();assert.equal(s.state.phase,'unknown');assert.equal(stopped,0);
 const raw=JSON.stringify({...reference,knownExisting:false});saved.setItem(EVE_INTERACTION_PENDING,raw);const bad=createEveInteractionSession({work,storage:saved,changed(){}});bad.arm();await bad.stop();assert.equal(bad.state.phase,'unknown');assert.equal(saved.getItem(EVE_INTERACTION_PENDING),raw);
});

void test('storage upgrade failure does not route a known job through the legacy stop',async()=>{
 const data=new Map();let writes=0,legacy=0,existing=0;const saved={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(++writes>1)throw Error('storage unavailable');data.set(k,v);},removeItem:k=>data.delete(k)};
 const work={prepare:async input=>({input,agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64)}),start:async()=>({status:'running',text:null}),read:async()=>({status:'running',text:null}),stop:async()=>{legacy++;return {status:'stopped',text:null};},stopExisting:async()=>{existing++;return {status:'stopped',text:null};}};
 const s=createEveInteractionSession({work,storage:saved,changed(){}});s.arm();s.hearFinal('Hey Eve');s.hearFinal('依頼');await s.confirm();assert.equal(s.state.phase,'unknown');assert.ok(saved.getItem(EVE_INTERACTION_PENDING));await s.stop();assert.equal(s.state.phase,'standby');assert.equal(existing,1);assert.equal(legacy,0);
});
