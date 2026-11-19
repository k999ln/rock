import test from 'node:test';
import assert from 'node:assert/strict';
import {createEveInteractionSession,EVE_INTERACTION_PENDING} from '../dist/index.mjs';
test('the distributed Core retains known-existing provenance after client reload and missing server reads',async()=>{
 const reference={id:crypto.randomUUID(),agentId:'agent',agentSha256:'a'.repeat(64),modelSha256:'b'.repeat(64),input:'saved job'};
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};let legacyStops=0;
 const work={prepare:async()=>{throw Error('no new work');},start:async()=>{throw Error('no new work');},read:async()=>null,stop:async()=>{legacyStops++;return {status:'stopped',text:null};}};
 const first=createEveInteractionSession({work,storage,changed(){}});await first.resume(reference);assert.equal(JSON.parse(data.get(EVE_INTERACTION_PENDING)).knownExisting,true);await first.stop();assert.equal(first.state.phase,'unknown');
 const restored=createEveInteractionSession({work,storage,changed(){}});restored.arm();await restored.stop();assert.equal(restored.state.phase,'unknown');assert.equal(restored.state.jobId,reference.id);assert.equal(legacyStops,0);assert.equal(data.size,1);
});
