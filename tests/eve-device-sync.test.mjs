import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {eveDeviceSyncStore} from '../lib/eve-device-sync.ts';
import {eveHistoryStore} from '../lib/eve-history.ts';
import {beginLinuxRun,finishLinuxRun} from '../lib/sky-linux-local.ts';
const keys={current:'test',keys:{test:'ab'.repeat(32)}};
function fixture(t){const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 for(const f of ['0070_eve_durable_history.sql','0075_eve_device_jobs.sql','0076_eve_device_commands.sql'])sql.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 sql.exec('CREATE TABLE rockstar_device_sessions(id TEXT PRIMARY KEY,user_id TEXT,revoked_at INTEGER,expires_at INTEGER)');
 const prepare=(query,args=[])=>({bind(...v){return prepare(query,v);},async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}};}});
 const db={prepare,async batch(a){sql.exec('BEGIN');try{const results=[];for(const q of a)results.push(await q.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const device=randomUUID();sql.prepare('INSERT INTO rockstar_device_sessions VALUES(?,?,NULL,?)').run(device,'alice',Date.now()+86400000);
 return {sql,db,device,sync:(owner='alice')=>eveDeviceSyncStore(db,owner,keys),history:(owner='alice')=>eveHistoryStore(db,owner,keys,true)};
}
function run(){const agent={id:randomUUID(),name:'文章担当',instructions:'短く書く',modelId:'local',sha256:'cd'.repeat(32)};return finishLinuxRun(beginLinuxRun(agent,'[同期試験] 会話の続きを書く',randomUUID(),'ef'.repeat(32)),{text:'合成の保存成果',modelSha256:'ef'.repeat(32),durationMs:123});}
void test('same linked-device job appears in the same encrypted owner conversation exactly once',async t=>{const f=fixture(t),r=run(),thread=r.job.id;const a=await f.sync().publish({run:r,threadId:thread,revision:0},f.device);assert.equal(a.revision,1);assert.deepEqual(await f.sync().publish({run:r,threadId:thread,revision:0},f.device),a);const j=(await f.sync().list())[0];assert.equal(j.run.job.id,r.job.id);assert.equal(j.provenance,'linked-device-report');assert.equal((await f.history().get(thread)).session.messages.length,2);assert.equal((await f.history().get(thread)).session.activeRequest,null);assert.equal((await f.sync('bob').list()).length,0);await assert.rejects(f.history('bob').get(thread),e=>e.status===404);assert.doesNotMatch(JSON.stringify(f.sql.prepare('SELECT * FROM eve_device_jobs').all()),/合成|会話|文章担当/);});
void test('mirror rejects stale updates, different writers, changed inputs, and completed result replacement',async t=>{const f=fixture(t),r=run(),base={run:r,threadId:r.job.id,revision:0};await f.sync().publish(base,f.device);await assert.rejects(f.sync().publish(base,randomUUID()),e=>e.status===409);await assert.rejects(f.sync().publish({...base,run:{...r,input:'別の依頼'},revision:1},f.device),e=>e.status===409);await assert.rejects(f.sync().publish({...base,run:{...r,text:'差替え'},revision:1},f.device),e=>e.status===409);await assert.rejects(f.sync().publish({...base,run:{...r,stop:'confirmed'}},f.device),e=>e.status===409);assert.equal((await f.sync().list())[0].run.text,r.text);});
void test('Web continuation queues one exact request; only its bound device sees it; expiry and revocation fence dispatch',async t=>{const f=fixture(t),r=run(),thread=r.job.id;await f.sync().publish({run:r,threadId:thread,revision:0},f.device);await f.sync().presence({name:'Pixel',phase:'ready',agents:[r.agent],models:[{id:r.agent.modelId,name:'Local model',sha256:r.modelSha256}],preparedModels:[r.agent.modelId]},f.device);const input={id:randomUUID(),threadId:thread,deviceId:f.device,agentId:r.agent.id,input:'その続きを短く',confirm:'run-on-pixel'};await f.sync().enqueue(input);await f.sync().enqueue(input);assert.equal((await f.sync().pending(f.device)).length,1);assert.equal((await f.sync().pending(randomUUID())).length,0);assert.equal((await f.sync('bob').pending(f.device)).length,0);const command=(await f.sync().pending(f.device))[0].command;assert.equal(command.requestId,input.id);assert.match(command.context,/合成の保存成果/);assert.equal(command.modelSha256,r.modelSha256);await assert.rejects(f.sync().enqueue({...input,input:'別の内容'}),e=>e.status===409);f.sql.prepare('UPDATE eve_device_commands SET expires_at=0').run();assert.equal((await f.sync().pending(f.device)).length,0);f.sql.prepare('UPDATE rockstar_device_sessions SET revoked_at=1').run();await assert.rejects(f.sync().enqueue({...input,id:randomUUID()}),e=>e.status===409);});
void test('a continuation appends a new job into the original thread and never rewrites Web messages',async t=>{const f=fixture(t),thread=randomUUID();await f.history().save({session:{version:1,id:thread,toolId:'sky-auto',createdAt:Date.now(),messages:[{id:'web-original',side:'me',text:'Webで決めた色は藍色'}],activeRequest:null,workflowStatus:'ready',outcome:null},revision:0,remember:true});const r=run();await f.sync().publish({run:r,threadId:thread,revision:0},f.device);const messages=(await f.history().get(thread)).session.messages;assert.equal(messages.length,3);assert.equal(messages[0].id,'web-original');assert.equal(messages[0].text,'Webで決めた色は藍色');assert.equal((await f.sync().list(thread))[0].run.job.id,r.job.id);});
void test('deleting a conversation erases its device replicas and cannot resurrect them from an offline Pixel',async t=>{const f=fixture(t),r=run(),input={run:r,threadId:r.job.id,revision:0};await f.sync().publish(input,f.device);await f.history().remove(r.job.id,1);assert.equal((await f.sync().list()).length,0);await assert.rejects(f.sync().publish(input,f.device),e=>e.status===410);assert.equal(f.sql.prepare('SELECT count(*) AS n FROM eve_device_jobs').get().n,0);});

void test('smis handoff pins role and model versions; changes require new consent and never queue work', async t => {
  const f=fixture(t),r=run();
  const presence={name:'Pixel',phase:'ready',agents:[r.agent],models:[{id:r.agent.modelId,name:'Local model',sha256:r.modelSha256}],preparedModels:[r.agent.modelId]};
  await f.sync().presence(presence,f.device);
  const input={id:randomUUID(),threadId:randomUUID(),deviceId:f.device,agentId:r.agent.id,agentSha256:r.agent.sha256,modelSha256:r.modelSha256,input:'短い下書きを作る',confirm:'run-on-pixel'};
  for(const patch of [{agentSha256:'12'.repeat(32)},{modelSha256:'34'.repeat(32)},{agentSha256:'bad'},{modelSha256:undefined}])
    await assert.rejects(f.sync().enqueue({...input,...patch}));
  assert.equal((await f.sync().pending(f.device)).length,0);
  await assert.rejects(f.sync('bob').enqueue(input),e=>e.status===409);
  await f.sync().enqueue(input);await f.sync().enqueue(input);
  assert.equal((await f.sync().pending(f.device)).length,1);
  const command=(await f.sync().pending(f.device))[0].command;
  assert.equal(command.agentSha256,input.agentSha256);assert.equal(command.modelSha256,input.modelSha256);
  await f.sync().presence({...presence,agents:[{...r.agent,sha256:'56'.repeat(32)}]},f.device);
  await assert.rejects(f.sync().enqueue({...input,id:randomUUID()}),e=>e.status===409);
  assert.equal((await f.sync().pending(f.device)).length,1);
  // Identical retry reconciles the existing command; it never creates a second run.
  assert.equal((await f.sync().enqueue(input)).id,input.id);
});
