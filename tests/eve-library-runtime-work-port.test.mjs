import test from 'node:test';
import assert from 'node:assert/strict';
import {purposeFixture} from './helpers/eve-purpose-fixture.mjs';
import {createLibraryRuntimeEveWorkPort,libraryEvePendingKey,purposeEvePendingKey} from '../lib/eve-purpose-runtime-work-port.ts';
function agent(f){const a={id:crypto.randomUUID(),revision:1,updatedAt:Date.now(),source:'personal',sourceTool:null,name:'短い文章の担当',instructions:'依頼された文章を短く下書きしてください。',provider:'local-model',model:f.binding.modelId,enabled:true};f.library.set(a.id,a);return a;}
void test('saved smis agent registers the exact ID and revision without another library write',async t=>{
 const f=await purposeFixture(t),a=agent(f),work=createLibraryRuntimeEveWorkPort({...f.options,agent:a});
 const ref=await work.prepare('短い案内文を作る',()=>true);
 assert.equal(ref.agentId,a.id);assert.equal(f.library.size,1);assert.equal(f.counts.libraryWrites,0);assert.equal(f.counts.preparationWrites,1);assert.equal(f.counts.runtimeStarts,0);
 const second=await work.prepare('次の案内文を作る',()=>true);assert.equal(second.agentId,a.id);assert.equal(f.counts.preparationWrites,1);
 await work.start({id:crypto.randomUUID(),...second});assert.equal(f.counts.runtimeStarts,1);
 assert.notEqual(libraryEvePendingKey(f.binding,a),purposeEvePendingKey(f.binding));
 assert.notEqual(libraryEvePendingKey(f.binding,a),libraryEvePendingKey(f.binding,{...a,revision:2}));
});
void test('changed or disabled saved revision rejects both preparation and dispatch',async t=>{
 const f=await purposeFixture(t),a=agent(f),work=createLibraryRuntimeEveWorkPort({...f.options,agent:a});
 const ref=await work.prepare('案内文を作る',()=>true);
 f.library.set(a.id,{...a,revision:2});
 await assert.rejects(work.start({id:crypto.randomUUID(),...ref}),/変わりました/);
 await assert.rejects(work.prepare('案内文を作る',()=>true),/変わりました/);assert.equal(f.counts.runtimeStarts,0);
 f.library.set(a.id,{...a,enabled:false});await assert.rejects(work.prepare('案内文を作る',()=>true),/変わりました/);
});
void test('unsupported provider, object role, mismatched model and deleted saved agent cannot create or start',async t=>{
 const f=await purposeFixture(t),a=agent(f);
 for(const patch of [{provider:'pollinations'},{model:'other'},{attachment:{}},{revision:0},{source:'sky-tool'}])assert.throws(()=>createLibraryRuntimeEveWorkPort({...f.options,agent:{...a,...patch}}));
 const work=createLibraryRuntimeEveWorkPort({...f.options,agent:a});f.library.delete(a.id);
 await assert.rejects(work.prepare('案内文を作る',()=>true));assert.equal(f.counts.libraryWrites,0);assert.equal(f.counts.preparationWrites,0);assert.equal(f.counts.runtimeStarts,0);
});
