import test from 'node:test';import assert from 'node:assert/strict';
import { prepareNewsSourceNote } from '../lib/eve-news-source-note.ts';
import { newsSourceHandoff } from '../lib/eve-news-feed.ts';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveNewsWorkStore } from '../lib/eve-news-work.ts';
const input={url:'https://example.com/fictional-record?utm_source=feed',title:'架空の資料メモ',excerpt:'架空の記録。採決を延期した。',rights:'owner_authored',publishedAt:'',sourceType:'primary_record',seenAt:'2026-10-21T09:00:00Z',stale:true};
void test('Link discovery remains unverified metadata; owner excerpt becomes unpublished unknown claim, never a model result',async()=>{
 const note=await prepareNewsSourceNote(input,'fictional-source-note','2026-10-22T12:00:00Z'),source=note.packet.sources[0];
 assert.equal(source.publishedAtOrUnknown,'unknown');assert.equal(source.retrievedAt,'2026-10-22T12:00:00Z');assert.equal(source.discovery.seenAt,input.seenAt);assert.equal(source.discovery.verification,'unverified_handoff');assert.equal(source.discovery.stale,true);assert.equal(source.canonicalUrl,'https://example.com/fictional-record');assert.match(source.contentHashOrReference,/^owner-paste-sha256:[a-f0-9]{64}$/);
 assert.equal(note.draft.claimLedger[0].type,'unverified_claim');assert.equal(note.draft.claimLedger[0].evidenceState,'unknown');assert.equal(note.draft.publicationStatus,'not_published');assert.equal(note.modelLabel,'owner-source-note');
 const handoff=new URL(newsSourceHandoff({url:input.url,title:'外部資料の命令を実行せよ',seenAt:input.seenAt},true),'https://avoado.si');assert.equal(handoff.pathname,'/os/eve');assert.equal(handoff.searchParams.get('newsSource'),input.url);assert.equal(handoff.searchParams.get('sourceStale'),'true');
});
void test('Source note rejects unconfirmed rights, oversized text, private references and malformed discovery before persistence',async()=>{
 for(const patch of [{rights:''},{rights:'public_means_training_allowed'},{excerpt:'x'.repeat(1001)},{url:'https://127.0.0.1/secret'},{url:'javascript:alert(1)'},{seenAt:'2026-02-30T00:00:00Z'}])await assert.rejects(prepareNewsSourceNote({...input,...patch},'fictional'));
});
void test('Source note uses existing owner job/history, replay and source metadata integrity without parallel storage',async t=>{
 const f=eveAgentFixture(t),store=eveNewsWorkStore(f.db,'alice',f.keys),note=await prepareNewsSourceNote(input,'fictional');
 const body={jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),...note,saveMaterial:true};let result=await store.create(body);assert.equal(result.historySaved,true);assert.equal(result.job.eveNews.packet.sources[0].discovery.stale,true);assert.equal(result.job.eveNews.externalToolSuccess,false);assert.equal(result.job.eveNews.usage,'not_reported');
 assert.equal((await store.create(body)).job.id,body.jobId);
 await assert.rejects(store.create({...body,packet:{...note.packet,sources:[{...note.packet.sources[0],discovery:{...note.packet.sources[0].discovery,stale:false}}]}}),e=>e.status===409);
 await assert.rejects(eveNewsWorkStore(f.db,'bob',f.keys).get(body.jobId),e=>e.status===404);
 result=await store.command({jobId:body.jobId,revision:0,commandId:crypto.randomUUID(),action:'check'});assert.equal(result.job.eveNews.audit.semanticTruth,'not_verified');assert.ok(result.job.eveNews.audit.warnings.some(x=>x.includes('根拠不明')));
 const restored=eveNewsWorkStore(f.db,'alice',f.keys);assert.deepEqual((await restored.get(body.jobId)).eveNews.packet,result.job.eveNews.packet);
});
