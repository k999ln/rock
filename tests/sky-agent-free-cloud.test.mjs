import test from 'node:test';
import {applySourceSandboxSchema} from '../scripts/sky-monthly-sandbox-db.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {skyAgentLibraryStore} from '../lib/sky-agent-library-store.ts';
import {bindSkyAgentFreeCloud} from '../lib/sky-agent-free-cloud.ts';
import {generateText} from '../lib/llm-providers.ts';
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 applySourceSandboxSchema(sql);
 const db={prepare(q){return {bind(...args){return {async first(){return sql.prepare(q).get(...args)??null;},async all(){return {results:sql.prepare(q).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}};}};}};}};
 return {sql,db,store:skyAgentLibraryStore(db,'owner-synthetic')};
}
const settings={name:'検証担当',instructions:'短く事実と未確認を分けて答える',provider:'pollinations',model:'openai-fast',enabled:true};
void test('role binding uses owner-owned immutable revision/model and server instructions, not forged system',async t=>{
 const {db,store}=fixture(t),a=await store.save(randomUUID(),0,settings,true);
 const value={agentId:a.id,agentRevision:a.revision,provider:a.provider,model:a.model,prompt:'合成データの依頼',system:'forged'};
 const bound=await bindSkyAgentFreeCloud(db,'owner-synthetic',value);
 assert.deepEqual(bound.agentBinding,{id:a.id,revision:1});assert.ok(bound.prompt.includes(settings.instructions));assert.ok(!bound.prompt.includes('forged'));assert.ok(bound.prompt.endsWith(value.prompt));
 for(const [owner,patch,status] of [['other-owner',{},404],['owner-synthetic',{agentRevision:0},409],['owner-synthetic',{model:'other'},409],['owner-synthetic',{provider:'openai'},409],['owner-synthetic',{agentRevision:undefined},409]])
  await assert.rejects(bindSkyAgentFreeCloud(db,owner,{...value,...patch}),{status});
 await store.save(a.id,1,{...settings,enabled:false});await assert.rejects(bindSkyAgentFreeCloud(db,'owner-synthetic',{...value,agentRevision:2}),{status:409});
});
void test('legacy jobs remain byte-identical; oversized role plus prompt fails before execution',async t=>{
 const {db,store}=fixture(t);assert.deepEqual(await bindSkyAgentFreeCloud(db,'owner-synthetic',{prompt:'legacy'}),{prompt:'legacy',agentBinding:undefined});
 const a=await store.save(randomUUID(),0,settings,true);
 await assert.rejects(bindSkyAgentFreeCloud(db,'owner-synthetic',{agentId:a.id,agentRevision:1,provider:a.provider,model:a.model,prompt:'x'.repeat(12000)}),{status:413});
});
void test('generic generator never routes free-service provider through paid or local adapters',async()=>{
 let requests=0;await assert.rejects(generateText({provider:'pollinations',model:'openai-fast',prompt:'synthetic'}, {},async()=>{requests++;throw Error('network forbidden');}),{code:'FREE_CLOUD_SERVICE_REQUIRED'});assert.equal(requests,0);
});
