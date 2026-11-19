import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{eveAgentFixture}from'./helpers/eve-agent-fixture.mjs';import{eveNewsWorkStore}from'../lib/eve-news-work.ts';import{newsLearningCheck,newsLearningPreview}from'../lib/eve-news-learning.ts';
const packet=JSON.parse(readFileSync(new URL('../toolkits/eve-news/examples/fictional-packet.json',import.meta.url)));
const draft={headline:'架空の採決',articleText:'採決を延期した。',claimLedger:[{id:'c1',text:'採決を延期した',type:'unverified_claim',evidenceState:'unknown',sourceIds:['record-1'],reason:'要確認'}],unresolvedQuestions:['結果の確認']};
async function setup(t,patch={}){const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys);let job=(await store.create({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),packet:{...packet,...patch.packet},draft:{...draft,...patch.draft},modelLabel:'owner-authored',saveMaterial:true})).job;job=(await store.command({jobId:job.id,revision:0,commandId:crypto.randomUUID(),action:'check'})).job;const read=async(split='evaluation',preview=false)=>store.learning({jobId:job.id,revision:(await store.get(job.id)).revision,split,preview});const grant=async(split='evaluation',patch={})=>{const current=await store.get(job.id),{check}=await read(split);return store.command({jobId:job.id,revision:current.revision,commandId:crypto.randomUUID(),action:'learning-grant',split,dataSha256:check.dataSha256,rightsReviewed:true,sensitiveDataReviewed:true,allowDatasetPreparation:true,...patch})};return{...f,store,job,read,grant};}
void test('Saving/remembering never grants preparation; explicit hash-bound permission allows only private, untrained evaluation data',async t=>{
 const f=await setup(t);f.sqlite.prepare('UPDATE eve_conversations SET remember=1').run();assert.equal((await f.read()).check.consentStatus,'not_granted');await assert.rejects(f.read('evaluation',true),e=>e.status===403);
 await assert.rejects(f.grant('evaluation',{rightsReviewed:false}));await assert.rejects(f.grant('evaluation',{dataSha256:'a'.repeat(64)}),e=>e.status===409);
 const before=await f.store.get(f.job.id),result=await f.grant(),after=result.job;assert.deepEqual(after.eveNews.packet,before.eveNews.packet);assert.deepEqual(after.eveNews.draft,before.eveNews.draft);assert.deepEqual(after.eveNews.audit,before.eveNews.audit);assert.equal(after.status,before.status);
 const preview=await f.read('evaluation',true);assert.equal(preview.dataset.trainingAllowed,false);assert.equal(preview.dataset.records.length,1);assert.equal(preview.dataset.records[0].verification.semanticTruth,'not_verified');assert.equal(preview.dataset.acceptance.modelLicense,'not_reviewed');assert.equal(JSON.stringify(preview.dataset).includes('learningConsents'),false);assert.equal(JSON.stringify(preview.dataset).includes('thinking'),false);
 assert.equal((await f.read('training_candidate')).check.blockedReasons.includes('known_evaluation_material'),true);await assert.rejects(f.grant('training_candidate'),e=>e.status===409);
});
void test('Owner rights, source credentials and contacts are checked before granting or exporting; quote rights are insufficient',async t=>{
 const quote=await setup(t,{packet:{sources:packet.sources.map(s=>({...s,rightsScope:'summarize_and_quote'}))}});assert.ok((await quote.read()).check.blockedReasons.includes('rights_not_owner_authored'));await assert.rejects(quote.grant(),e=>e.status===409);
 for(const secret of ['Bearer abcdefghijklmnop1234','alice@example.com','パスワード: secret1234','+1 212 555 1234']){const f=await setup(t,{draft:{articleText:secret}});assert.ok((await f.read()).check.sensitiveFlags.length>0);await assert.rejects(f.grant(),e=>e.status===409);}
 const metadata=await setup(t,{packet:{sources:[{...packet.sources[0],contentHashOrReference:'sk-abcdefghijklmnopqrstuvwxyz123456'}]}});assert.ok((await metadata.read()).check.sensitiveFlags.includes('credential_pattern'));
 const f=await setup(t);await assert.rejects(eveNewsWorkStore(f.db,'bob',f.keys).learning({jobId:f.job.id,revision:f.job.revision,split:'evaluation'}),e=>e.status===404);
});
void test('Withdrawal fences a late grant, survives key loss/stopped work and replay cannot resurrect permission',async t=>{
 const f=await setup(t),{check}=await f.read();const staleGrant={jobId:f.job.id,revision:f.job.revision,commandId:crypto.randomUUID(),action:'learning-grant',split:'evaluation',dataSha256:check.dataSha256,rightsReviewed:true,sensitiveDataReviewed:true,allowDatasetPreparation:true};
 let j=(await f.store.command({jobId:f.job.id,revision:f.job.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'})).job;assert.equal(j.revision,f.job.revision+1);await assert.rejects(f.store.command(staleGrant),e=>e.status===409);
 j=(await f.grant()).job;const consent=j.eveNews.learningConsents.at(-1),grantReplay={...staleGrant,revision:j.revision-1,commandId:consent.commandId};
 j=(await f.store.command({jobId:j.id,revision:j.revision,commandId:crypto.randomUUID(),action:'cancel'})).job;
 const withdrawn=await eveNewsWorkStore(f.db,'alice').command({jobId:j.id,revision:j.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'});assert.equal(withdrawn.job.status,'cancelled');assert.equal(withdrawn.job.eveNews.learningConsents.at(-1).status,'withdrawn');assert.equal(withdrawn.historySaved,false);
 const replay=await f.store.command(grantReplay);assert.equal(replay.job.eveNews.learningConsents.at(-1).status,'withdrawn');await assert.rejects(f.read('evaluation',true),e=>e.status===403);
});
void test('Source/draft changes stale the consent; deleted history and a withdrawal during final readback stop preparation',async t=>{
 const f=await setup(t);let j=(await f.grant()).job;j=(await f.store.command({jobId:j.id,revision:j.revision,commandId:crypto.randomUUID(),action:'revise',draft:{...j.eveNews.draft,headline:'訂正後の架空見出し'},modelLabel:'owner-edited',reason:'対象変更'})).job;assert.equal((await f.read()).check.consentStatus,'stale');await assert.rejects(f.read('evaluation',true),e=>e.status===403);
 const g=await setup(t);j=(await g.grant()).job;await assert.rejects(newsLearningPreview(j,'evaluation',async()=>{const current=await g.store.get(j.id);return(await g.store.command({jobId:j.id,revision:current.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'})).job},async()=>{}),e=>e.status===409);
 const h=await setup(t);await h.grant();h.sqlite.prepare('UPDATE eve_conversations SET deleted_at=1').run();await assert.rejects(h.read('evaluation',true),e=>e.status===404);const current=await h.store.get(h.job.id);assert.equal((await h.store.command({jobId:current.id,revision:current.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'})).job.eveNews.learningConsents.at(-1).status,'withdrawn');
});
void test('Content grouping ignores per-job identity; consecutive withdrawals stay bounded and old grants remain auditable',async t=>{
 const f=await setup(t),g=await setup(t);assert.equal((await newsLearningCheck(f.job,'evaluation')).contentSha256,(await newsLearningCheck(g.job,'evaluation')).contentSha256);
 let j=(await f.grant()).job;for(let i=0;i<25;i++)j=(await f.store.command({jobId:j.id,revision:j.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'})).job;assert.equal(j.eveNews.learningConsents.length,2);assert.equal(j.eveNews.learningConsents[0].status,'granted');assert.equal(j.eveNews.learningConsents[1].status,'withdrawn');
});
void test('Conversation deletion wins the atomic grant update and the final export fence',async t=>{
 const f=await setup(t),prepare=f.db.prepare;let injected=false;
 f.db.prepare=(sql)=>{const statement=prepare(sql);if(!injected&&sql.startsWith('UPDATE work_jobs')&&sql.includes('eve_conversations'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async run(){injected=true;f.sqlite.prepare('UPDATE eve_conversations SET deleted_at=1').run();return bound.run();}};}};return statement;};
 await assert.rejects(f.grant(),e=>e.status===409);assert.equal(injected,true);assert.equal((await f.store.get(f.job.id)).eveNews.learningConsents,undefined);
 const g=await setup(t);await g.grant();const original=g.db.prepare;let deleted=false;
 g.db.prepare=(sql)=>{const statement=original(sql);if(sql.startsWith('SELECT w.payload FROM work_jobs w'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async first(){deleted=true;g.sqlite.prepare('UPDATE eve_conversations SET deleted_at=1').run();return bound.first();}};}};return statement;};
 await assert.rejects(g.read('evaluation',true),e=>e.status===410);assert.equal(deleted,true);
});
void test('Material previously prepared for evaluation cannot be relabeled into training after withdrawal or annotation-only edits',async t=>{
 const source={...packet.sources[0],canonicalUrl:'https://example.org/meeting-record',publisherOrSpeaker:'本人の会議記録',contentHashOrReference:'owner-note-v1',excerpt:'会議では次回の作業日程が話し合われた。'};
 const f=await setup(t,{packet:{jobId:'meeting-record',topic:'作業会議の記録',sources:[source]},draft:{headline:'作業会議の記録',articleText:'次回の作業日程が話し合われた。',claimLedger:[{id:'c1',text:'次回の作業日程が話し合われた。',type:'unverified_claim',evidenceState:'unknown',sourceIds:['record-1'],reason:'本人の記録から確認する'}]}});
 assert.equal((await f.read('training_candidate')).check.knownEvaluationIndicators,false);await f.grant('training_candidate');const candidate=await f.read('training_candidate',true);assert.equal(candidate.dataset.split,'training_candidate');assert.equal(candidate.dataset.trainingAllowed,false);let j=(await f.grant('evaluation')).job;j=(await f.store.command({jobId:j.id,revision:j.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'})).job;assert.ok((await f.read('training_candidate')).check.blockedReasons.includes('known_evaluation_material'));await assert.rejects(f.grant('training_candidate'),e=>e.status===409);
 const changed=structuredClone(j);changed.eveNews.draft.claimLedger[0].reason='注釈だけを変更';const before=await newsLearningCheck(j,'training_candidate'),after=await newsLearningCheck(changed,'training_candidate');assert.notEqual(after.dataSha256,before.dataSha256);assert.equal(after.contentSha256,before.contentSha256);assert.equal(after.knownEvaluationIndicators,true);
});
async function copiedMaterial(t){
 const f=eveAgentFixture(t);
 const sources=[{...packet.sources[0],canonicalUrl:'https://example.org/owner-work-note',publisherOrSpeaker:'本人',contentHashOrReference:'owner-note',excerpt:'作業日程が話し合われた。'}];
 async function make(owner='alice'){
  const store=eveNewsWorkStore(f.db,owner,f.keys),job=(await store.create({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),packet:{...packet,jobId:crypto.randomUUID(),topic:'作業記録',sources},draft:{...draft,headline:'作業日程',articleText:'作業日程が話し合われた。',claimLedger:[{...draft.claimLedger[0],text:'作業日程が話し合われた。',reason:'本人の記録'}]},modelLabel:'owner-authored',saveMaterial:true})).job;
  const read=async(split='training_candidate',preview=false)=>store.learning({jobId:job.id,revision:(await store.get(job.id)).revision,split,preview});
  const grant=async(split='training_candidate')=>{const current=await store.get(job.id),{check}=await read(split);return store.command({jobId:job.id,revision:current.revision,commandId:crypto.randomUUID(),action:'learning-grant',split,dataSha256:check.dataSha256,rightsReviewed:true,sensitiveDataReviewed:true,allowDatasetPreparation:true});};
  return{store,job,read,grant};
 }
 return{...f,make};
}
void test('Evaluation assignments cover copied owner jobs after withdrawal, without observing another owner',async t=>{
 const f=await copiedMaterial(t),train=await f.make(),evaluation=await f.make();await train.grant();assert.equal((await train.read('training_candidate',true)).dataset.trainingAllowed,false);const e=(await evaluation.grant('evaluation')).job;
 assert.notEqual((await train.read()).check.dataSha256,(await evaluation.read()).check.dataSha256);assert.equal((await train.read()).check.contentSha256,(await evaluation.read()).check.contentSha256);
 assert.ok((await train.read()).check.blockedReasons.includes('known_evaluation_material'));await assert.rejects(train.read('training_candidate',true),x=>x.status===403);
 await evaluation.store.command({jobId:e.id,revision:e.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'});const copied=await f.make();await assert.rejects(copied.grant(),x=>x.status===409);
 const bob=await f.make('bob');assert.equal((await bob.read()).check.knownEvaluationIndicators,false);await bob.grant();assert.equal((await bob.read('training_candidate',true)).dataset.trainingAllowed,false);
});
void test('An evaluation grant committed during another job training grant wins the atomic SQL fence',async t=>{
 const f=await copiedMaterial(t),train=await f.make(),evaluation=await f.make(),prepare=f.db.prepare;let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('UPDATE work_jobs')&&sql.includes('evaluated.user_id'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async run(){if(!injected){injected=true;await evaluation.grant('evaluation');}return bound.run();}};}};return statement;};
 await assert.rejects(train.grant(),x=>x.status===409);assert.equal(injected,true);assert.equal((await train.store.get(train.job.id)).eveNews.learningConsents,undefined);
});
void test('Evaluation arriving during candidate preview prevents final export even when its own job revision did not change',async t=>{
 const f=await copiedMaterial(t),train=await f.make(),evaluation=await f.make();await train.grant();const revision=(await train.store.get(train.job.id)).revision,prepare=f.db.prepare;let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT w.payload FROM work_jobs w')&&sql.includes('evaluated.user_id'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async first(){if(!injected){injected=true;await evaluation.grant('evaluation');}return bound.first();}};}};return statement;};
 await assert.rejects(train.read('training_candidate',true),x=>x.status===410);assert.equal(injected,true);assert.equal((await train.store.get(train.job.id)).revision,revision);
});
void test('Collection rechecks every consent, deterministically merges exact content duplicates and preserves every provenance',async t=>{
 const f=await copiedMaterial(t),a=await f.make(),b=await f.make();const aj=(await a.grant('evaluation')).job,bj=(await b.grant('evaluation')).job;
 const selected=[{jobId:aj.id,revision:aj.revision},{jobId:bj.id,revision:bj.revision}],before=JSON.stringify([aj,bj]);
 const one=await a.store.learningCollection({jobs:selected,split:'evaluation'}),two=await a.store.learningCollection({jobs:[...selected].reverse(),split:'evaluation'});
 assert.deepEqual(one,two);assert.equal(one.dataset.trainingAllowed,false);assert.equal(one.dataset.records.length,1);assert.equal(one.dataset.records[0].provenance.length,2);assert.equal(one.dataset.duplicateRecordsRemoved,1);assert.equal(one.dataset.selectedJobs.length,2);assert.equal(one.datasetSha256,await import('../lib/rockstar-entitlement-claim.ts').then(m=>m.sha256Hex(JSON.stringify(one.dataset))));assert.equal(JSON.stringify(one).includes('repairAttempts'),false);
 assert.equal(JSON.stringify([await a.store.get(aj.id),await b.store.get(bj.id)]),before);
 await assert.rejects(a.store.learningCollection({jobs:[selected[0],selected[0]],split:'evaluation'}),e=>e.status===400);await assert.rejects(a.store.learningCollection({jobs:Array(21).fill(selected[0]),split:'evaluation'}),e=>e.status===400);
 await assert.rejects(a.store.learningCollection({jobs:[{...selected[0],revision:0}],split:'evaluation'}),e=>e.status===409);
 await assert.rejects(a.store.learningCollection({jobs:selected,split:'training_candidate'}),e=>e.status===403);
 const other=await f.make('bob');await other.grant('evaluation');await assert.rejects(a.store.learningCollection({jobs:[{jobId:other.job.id,revision:1}],split:'evaluation'}),e=>e.status===404);
});
void test('A collection never drops an unconsented selection silently; withdrawal during its final snapshot refuses the whole output',async t=>{
 const f=await copiedMaterial(t),a=await f.make(),b=await f.make();const aj=(await a.grant('evaluation')).job;
 await assert.rejects(a.store.learningCollection({jobs:[{jobId:aj.id,revision:aj.revision},{jobId:b.job.id,revision:0}],split:'evaluation'}),e=>e.status===403);
 const bj=(await b.grant('evaluation')).job,prepare=f.db.prepare;let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT w.id,w.payload FROM work_jobs w'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async all(){if(!injected){injected=true;await b.store.command({jobId:bj.id,revision:bj.revision,commandId:crypto.randomUUID(),action:'learning-withdraw'});}return bound.all();}};}};return statement;};
 await assert.rejects(a.store.learningCollection({jobs:[{jobId:aj.id,revision:aj.revision},{jobId:bj.id,revision:bj.revision}],split:'evaluation'}),e=>e.status===409);assert.equal(injected,true);
});
void test('Collection final snapshot rejects a historical evaluation arriving after candidate checks, across all selected jobs',async t=>{
 const f=await copiedMaterial(t),a=await f.make(),b=await f.make(),evaluation=await f.make();const aj=(await a.grant()).job,bj=(await b.grant()).job,prepare=f.db.prepare;let injected=false;
 f.db.prepare=sql=>{const statement=prepare(sql);if(sql.startsWith('SELECT w.id,w.payload FROM work_jobs w'))return{...statement,bind(...args){const bound=statement.bind(...args);return{...bound,async all(){if(!injected){injected=true;await evaluation.grant('evaluation');}return bound.all();}};}};return statement;};
 await assert.rejects(a.store.learningCollection({jobs:[{jobId:aj.id,revision:aj.revision},{jobId:bj.id,revision:bj.revision}],split:'training_candidate'}),e=>e.status===409);assert.equal(injected,true);
});
void test('Collection keeps distinct annotations even when the material grouping hash is identical',async t=>{
 const f=await copiedMaterial(t),a=await f.make(),b=await f.make();const aj=(await a.grant('evaluation')).job;
 let bj=(await b.store.command({jobId:b.job.id,revision:0,commandId:crypto.randomUUID(),action:'check'})).job;const changed=structuredClone(bj.eveNews.draft);changed.claimLedger[0].reason='別の検収注釈を保持';bj=(await b.store.command({jobId:bj.id,revision:bj.revision,commandId:crypto.randomUUID(),action:'revise',draft:changed,modelLabel:'owner-authored',reason:'注釈を追加'})).job;bj=(await b.grant('evaluation')).job;
 const result=await a.store.learningCollection({jobs:[{jobId:aj.id,revision:aj.revision},{jobId:bj.id,revision:bj.revision}],split:'evaluation'});assert.equal(result.dataset.records.length,2);assert.equal(result.dataset.duplicateRecordsRemoved,0);assert.equal(result.dataset.records[0].contentSha256,result.dataset.records[1].contentSha256);assert.notEqual(result.dataset.records[0].recordSha256,result.dataset.records[1].recordSha256);
});
