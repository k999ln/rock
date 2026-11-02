import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {eveAgentFixture} from './helpers/eve-agent-fixture.mjs';
import {eveNewsWorkStore} from '../lib/eve-news-work.ts';
import {auditNewsDraft,cleanNewsInput} from '../lib/eve-news-audit.ts';
import {applyWorkCommand,createWorkJob} from '../lib/workflow.ts';
import {eveHistoryStore} from '../lib/eve-history.ts';
const packet=JSON.parse(readFileSync(new URL('../toolkits/eve-news/examples/fictional-packet.json',import.meta.url),'utf8'));
const draft={headline:'架空市議会の採決延期',articleText:'採決を延期した。追加の費用見積もりが必要だと議員Aが述べた。次の日程は不明。',claimLedger:[{id:'c1',text:'採決を延期した',type:'verified_fact',evidenceState:'supported',sourceIds:['record-1'],reason:'議事録の記載'},{id:'c2',text:'追加の費用見積もりが必要だと議員Aが述べた',type:'attributed_claim',evidenceState:'supported',sourceIds:['statement-1'],reason:'発言者へ帰属'},{id:'c3',text:'次の日程は不明',type:'unverified_claim',evidenceState:'unknown',sourceIds:['record-1'],reason:'日程は資料に記載されていない'}],unresolvedQuestions:['次の日程']};
const input=()=>({jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),packet:structuredClone(packet),draft:structuredClone(draft),modelLabel:'synthetic-untrusted-model@fixture',saveMaterial:true});
const command=(job,action,id=crypto.randomUUID())=>({jobId:job.id,revision:job.revision,commandId:id,action});
void test('News import/check/replay/reopen keep one owned job and encrypted conversation; no completion or publication authority',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),v=input();
 const [a,b]=await Promise.all([store.create(v),store.create(v)]);assert.equal(a.job.id,b.job.id);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n,1);
 const checked=await store.command(command(a.job,'check'));assert.equal(checked.job.status,'review');assert.equal(checked.job.eveNews.audit.semanticTruth,'not_verified');assert.equal(checked.job.eveNews.audit.politicalFairness,'not_evaluated');assert.equal(checked.job.eveNews.externalToolSuccess,false);assert.equal(checked.job.eveNews.usage,'not_reported');
 const event=checked.job.events[0].command;assert.equal((await store.command({...command(a.job,'check',event.id)})).job.revision,1);
 assert.throws(()=>applyWorkCommand(checked.job,{id:crypto.randomUUID(),action:'complete',note:'published'},1),/専用/);
 assert.equal((await eveNewsWorkStore(f.db,'alice',f.keys).get(v.jobId)).eveNews.audit.publication,'not_published');
 const history=await eveHistoryStore(f.db,'alice',f.keys).get(v.threadId);assert.match(history.session.messages.find(m=>m.side==='sky').text,/未掲載/);assert.doesNotMatch(f.sqlite.prepare('SELECT envelope FROM eve_messages LIMIT 1').get().envelope,/架空/);
 await assert.rejects(eveNewsWorkStore(f.db,'bob',f.keys).get(v.jobId),e=>e.status===404);await assert.rejects(store.create({...v,draft:{...v.draft,headline:'changed'}}),e=>e.status===409);
 const stop=await eveNewsWorkStore(f.db,'alice').command(command(checked.job,'cancel'));assert.equal(stop.job.status,'cancelled');assert.equal(stop.historySaved,false);await assert.rejects(store.command(command(stop.job,'check')),e=>e.status===409);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM agent_delegations').get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions').get().n,0);
});
void test('News rejects rights/citation/unsafe references and preserves failed corrections, duplicate and temporal checks without ideology filtering',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),v=input();
 await assert.rejects(store.create({...v,saveMaterial:false}));
 for(const url of ['https://127.0.0.1/a','https://0x7f000001/a','https://user:pass@example.com/a','https://localhost/a']){const p=structuredClone(packet);p.sources[0].canonicalUrl=url;assert.throws(()=>cleanNewsInput(p,draft,'fixture'));}
 assert.throws(()=>cleanNewsInput({...packet,sources:[{...packet.sources[0],rightsScope:'unknown'}]},draft,'fixture'));
 assert.throws(()=>cleanNewsInput(packet,{...draft,claimLedger:[{...draft.claimLedger[0],sourceIds:['invented']}]},'fixture'));
 const p=structuredClone(packet);p.sources.push({...p.sources[0],sourceId:'correction',sourceType:'correction_or_retraction',canonicalUrl:p.sources[0].canonicalUrl+'?utm_source=x#copy',publishedAtOrUnknown:'2026-10-20T11:00:00Z'});
 const saved=await store.create({...v,packet:p});const checked=await store.command(command(saved.job,'check'));assert.equal(checked.job.status,'active');assert.equal(checked.job.eveNews.audit.checks.find(c=>c.id==='correction_references').passed,false);assert.equal(checked.job.eveNews.audit.checks.find(c=>c.id==='unique_source_urls').passed,false);
 const clean=cleanNewsInput(packet,draft,'fixture'),now=Date.parse('2026-11-05T00:00:00Z'),old=auditNewsDraft(clean.packet,clean.draft,now);assert.ok(old.warnings.some(w=>w.includes('7日')));
 const future=structuredClone(clean.packet);future.sources[0].retrievedAt='2099-01-01T00:00:00Z';assert.equal(auditNewsDraft(future,clean.draft,now).checks.find(c=>c.id==='source_times').passed,false);
 const swapped=structuredClone(clean.packet);swapped.sources[1].publisherOrSpeaker='反対の政治立場の議員';assert.deepEqual(auditNewsDraft(swapped,clean.draft,now).checks,old.checks);
});
void test('News projection cannot overwrite a newer job revision after encryption; tombstones block import',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),v=input(),created=await store.create(v),batch=f.db.batch.bind(f.db);let fenced=false;
 f.db.batch=async items=>{if(!fenced){fenced=true;f.sqlite.prepare('UPDATE work_jobs SET revision=revision+1 WHERE id=?').run(v.jobId);}return batch(items);};
 const r=await store.command(command(created.job,'check'));assert.equal(r.historySaved,false);
 const hist=await eveHistoryStore(f.db,'alice',f.keys).get(v.threadId);assert.doesNotMatch(hist.session.messages.find(m=>m.side==='sky').text,/参照検査済み/);
 f.db.batch=batch;const fresh=input();const h=eveHistoryStore(f.db,'alice',f.keys);await h.save({session:{version:1,id:fresh.threadId,toolId:'sky-auto',createdAt:1,messages:[],activeRequest:null,workflowStatus:'ready',outcome:null},revision:0,remember:false});await h.remove(fresh.threadId,1);
 await assert.rejects(store.create(fresh),e=>e.status===410);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM work_jobs').get().n,1);
});

void test('News lookup filters the owner and thread before the shared job window; a deletion racing the first insert cannot create a job',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),v=input(),saved=await store.create(v);
 const insert=f.sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES (?,?,?,?,?)');
 for(let i=0;i<101;i++){const job=createWorkJob({id:crypto.randomUUID(),title:'Other article',templateId:'article'});insert.run(job.id,'alice',JSON.stringify(job),0,job.updatedAt);}
 assert.deepEqual((await store.list(v.threadId)).map(job=>job.id),[saved.job.id]);assert.deepEqual(await eveNewsWorkStore(f.db,'bob',f.keys).list(v.threadId),[]);
 const next=input(),h=eveHistoryStore(f.db,'alice',f.keys);await h.save({session:{version:1,id:next.threadId,toolId:'sky-auto',createdAt:1,messages:[],activeRequest:null,workflowStatus:'ready',outcome:null},revision:0,remember:false});
 const prepare=f.db.prepare;let fired=false;f.db.prepare=query=>{const s=prepare(query);if(!query.startsWith('INSERT INTO work_jobs'))return s;return {...s,bind(...args){const b=s.bind(...args);return {...b,async run(){if(!fired){fired=true;await h.remove(next.threadId,1);}return b.run();}};}};};
 await assert.rejects(store.create(next),e=>e.status===409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM work_jobs WHERE id=?').get(next.jobId).n,0);
});

void test('Failed News draft revisions preserve immutable sources, old draft/audit, bounded repairs and exact replay across reopen',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),v=input();
 const bad={...v.draft,articleText:'主張台帳と対応しない草稿。'};
 const created=await store.create({...v,draft:bad});const failed=await store.command(command(created.job,'check'));assert.equal(failed.job.status,'active');
 const revise={...command(failed.job,'revise'),draft:v.draft,modelLabel:'fixture',reason:'台帳に対応する文言へ訂正'};
 const saved=await store.command(revise);assert.equal(saved.job.id,v.jobId);assert.equal(saved.job.eveNews.threadId,v.threadId);assert.equal(saved.job.eveNews.audit,undefined);assert.equal(saved.job.eveNews.revisions[0].draft.articleText,bad.articleText);assert.equal(saved.job.eveNews.revisions[0].audit.checks.find(check=>check.id==='ledger_text_present').passed,false);assert.deepEqual(saved.job.eveNews.packet,created.job.eveNews.packet);assert.equal(saved.job.eveNews.requestSha256,created.job.eveNews.requestSha256);
 assert.equal((await eveNewsWorkStore(f.db,'alice',f.keys).command(revise)).job.revision,saved.job.revision);
 assert.equal((await store.create({...v,draft:bad})).job.eveNews.revisions.length,1);
 await assert.rejects(store.command({...revise,commandId:crypto.randomUUID(),revision:failed.job.revision}),e=>e.status===409);
 await assert.rejects(eveNewsWorkStore(f.db,'bob',f.keys).command(revise),e=>e.status===404);
 await assert.rejects(store.command({...revise,reason:'変更'}),e=>e.status===409);
 const checked=await store.command(command(saved.job,'check'));assert.equal(checked.job.status,'review');assert.equal(checked.job.eveNews.audit.publication,'not_published');
 await assert.rejects(store.command({...revise,commandId:crypto.randomUUID(),revision:checked.job.revision}),e=>e.status===400); // unchanged owner draft is still rejected after reference review
 const v2=input(),a=await store.create({...v2,draft:bad}),b=await store.command(command(a.job,'check'));
 const replace=async(job,text)=>store.command({...command(job,'revise'),draft:{...bad,articleText:text},modelLabel:'fixture',reason:'不一致を修正試行'});
 const c=await replace(b.job,'まだ不一致の草稿1');const e=await store.command(command(c.job,'check'));const g=await replace(e.job,'まだ不一致の草稿2');const h=await store.command(command(g.job,'check'));
 await assert.rejects(replace(h.job,'まだ不一致の草稿3'),e=>e.status===409);assert.equal((await store.get(v2.jobId)).eveNews.revisions.length,2);
 const stopped=await store.command(command(h.job,'cancel'));await assert.rejects(replace(stopped.job,'停止を復活'),e=>e.status===409);
});
