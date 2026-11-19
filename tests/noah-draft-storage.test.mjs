import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createNoahDraftApi } from '../lib/noah-drafts.ts';
import { createNoahDraftStorage, NOAH_DRAFT_STORAGE as LIMIT } from '../lib/noah-draft-storage.ts';
import { createNoahAgentApi } from '../lib/noah-agent-api.ts';
import { noahAgentTemplate, noahSha256 } from '../lib/noah-agent-upload.ts';
import { bundleUploadTest } from '../lib/noah-upload-bundle.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

function fixture(t) {
  const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
  for(const file of ['0033_noah_agent_uploads.sql','0034_noah_upload_refactor.sql','0035_noah_agent_drafts.sql','0040_noah_draft_storage.sql'])sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
  const db={prepare(query){return {bind(...args){return {async first(){return sql.prepare(query).get(...args)??null;},async all(){return {results:sql.prepare(query).all(...args)};}};}};}};
  const time={now:Date.now()},blobs=new Map(),deleted=[],hooks={};
  const bucket={async put(key,data){if(hooks.put)await hooks.put(key,data);blobs.set(key,new Uint8Array(data));},async get(key){return blobs.has(key)?{body:blobs.get(key)}:null;},async delete(key){if(hooks.delete)await hooks.delete(key);deleted.push(key);blobs.delete(key);},async list({prefix,limit,cursor}){const keys=[...blobs.keys()].filter(k=>k.startsWith(prefix)).sort((a,b)=>a<b?-1:a>b?1:0),start=cursor?keys.findIndex(k=>k>cursor):0,part=start<0?[]:keys.slice(start,start+limit),truncated=start>=0&&start+part.length<keys.length;return {objects:part.map(key=>({key,size:blobs.get(key).length})),truncated,...(truncated?{cursor:part.at(-1)}:{})};}};
  const authenticate=async req=>{const user=req.headers.get('test-owner');if(!user)throw Error('UNAUTHORIZED');return user;};
  const deps={db,bucket,authenticate,now:()=>time.now},api=createNoahDraftApi(deps),agents=createNoahAgentApi(deps),storage=createNoahDraftStorage(db,bucket,()=>time.now);
  return {sql,db,time,blobs,deleted,hooks,bucket,api,agents,storage};
}
async function req(method='GET',data,owner='alice',headers={}){return new Request('https://noah.example/api/noah/drafts/storage',{method,headers:{'test-owner':owner,origin:'https://noah.example','X-Rock-Owner-Scope':await ownerScopeFor(owner),...(data&&!(data instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},...(data?{body:data instanceof FormData?data:JSON.stringify(data)}:{})});}
function payload(overrides={}){return {revision:0,commandId:randomUUID(),clearSource:false,content:{manifest:{...noahAgentTemplate,adapter:'source',endpointUrl:null,name:'Storage fixture'},codeMode:'paste',codeName:'main.py',code:'print(42)\n',rights:true},...overrides};}
function form(value,bytes='file input',name='main.py'){const f=new FormData();f.set('draft',JSON.stringify(value));f.set('source',new File([bytes],name));return f;}
const draftRow=(f,id)=>f.sql.prepare('SELECT * FROM noah_agent_drafts WHERE id=?').get(id);
void test('unchanged attachments reuse storage; replacements wait for grace; source download survives collection',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload({content:{...payload().content,codeMode:'file',code:''}});
  assert.equal((await f.api.put(await req('PUT',form(p)),id)).status,201);const first=draftRow(f,id);
  assert.equal((await f.api.put(await req('PUT',form({...p,revision:1,commandId:randomUUID()})),id)).status,200);assert.equal(f.blobs.size,1);
  assert.equal((await f.api.put(await req('PUT',form({...p,revision:2,commandId:randomUUID()},'different file')),id)).status,200);const current=draftRow(f,id);
  assert.notEqual(first.source_key,current.source_key);assert.equal(f.blobs.size,2);
  await f.storage.collect('alice');assert.equal(f.deleted.length,0);f.time.now+=LIMIT.orphanMs+1;await f.storage.collect('alice');
  assert.deepEqual(f.deleted,[first.source_key]);assert.equal(await(await f.api.download(await req(),id)).text(),'different file');
  const summary=await f.storage.summary('alice');assert.equal(summary.objects,1);assert.equal(summary.objectBytes,14);assert.equal(summary.allocatedBytes,summary.inputBytes+summary.objectBytes);
});
void test('trash restores idempotently for seven days; purge and collector never resurrect deleted drafts',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload();await f.api.put(await req('PUT',form(p)),id);
  await f.api.remove(await req('DELETE',{revision:1}),id);assert.equal((await f.storage.summary('alice')).trash.length,1);
  assert.equal((await f.api.restore(await req('POST',{revision:2}),id)).status,200);
  assert.equal((await f.api.restore(await req('POST',{revision:2}),id)).status,200);assert.equal(draftRow(f,id).revision,3);
  await f.api.remove(await req('DELETE',{revision:3}),id);f.time.now+=LIMIT.trashMs+1;
  assert.equal((await f.api.restore(await req('POST',{revision:4}),id)).status,409);
  await f.storage.collect('alice');assert.equal(draftRow(f,id).content,'{}');assert.equal(draftRow(f,id).source_key,null);assert.equal(f.deleted.length,0);
  f.time.now+=LIMIT.orphanMs+1;await f.storage.collect('alice');assert.equal(f.blobs.size,0);
  assert.equal((await f.api.put(await req('PUT',p),id)).status,409);
});
void test('concurrent attachment reservations and text saves cannot exceed allocated quota',async t=>{
  const f=fixture(t),owner='alice',base=new Uint8Array(10*1024*1024),sha=await noahSha256(base);
  for(let i=0;i<6;i++)await f.storage.write(owner,randomUUID(),randomUUID(),sha,base);
  const small=new Uint8Array(3*1024*1024),digest=await noahSha256(small);
  const results=await Promise.allSettled([1,2].map(()=>f.storage.write(owner,randomUUID(),randomUUID(),digest,small)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.status,429);
  assert.ok((await f.storage.summary(owner)).allocatedBytes<=LIMIT.bytes);
  // Fill all but one short text record's allocation; two different IDs race.
  const value=payload(),bytes=Buffer.byteLength(JSON.stringify(value.content));
  const left=LIMIT.bytes-(await f.storage.summary(owner)).allocatedBytes-bytes-1;
  await f.storage.write(owner,randomUUID(),randomUUID(),'a'.repeat(64),new Uint8Array(left));
  const saves=await Promise.all([1,2].map(async()=>f.api.put(await req('PUT',payload()),randomUUID())));
  assert.equal(saves.filter(r=>r.status===201).length,1);assert.ok((await f.storage.summary(owner)).allocatedBytes<=LIMIT.bytes);
});
void test('failed R2 writes reserve bytes and retry; expired writers cannot attach and late bytes are recollected',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload();let fail=true;f.hooks.put=async()=>{if(fail)throw Error('unavailable');};
  assert.equal((await f.api.put(await req('PUT',form(p)),id)).status,503);assert.equal((await f.storage.summary('alice')).reservedBytes,10);
  fail=false;assert.equal((await f.api.put(await req('PUT',form(p)),id)).status,201);
  let release,started;const signal=new Promise(r=>{started=r;});f.hooks.put=async()=>{started();await new Promise(r=>{release=r;});};
  const other=randomUUID(),pending=f.api.put(await req('PUT',form(payload())),other);await signal;
  f.time.now+=LIMIT.writeMs+1;await f.storage.collect('alice');f.time.now+=LIMIT.orphanMs+1;await f.storage.collect('alice');release();
  assert.equal((await pending).status,410);assert.equal(draftRow(f,other),undefined);
  const late=[...f.blobs.keys()].find(k=>k.includes(other));assert.ok(late);
  await f.storage.inventory('alice');await f.storage.collect('alice');assert.equal(f.blobs.has(late),false);
  assert.equal(await(await f.api.download(await req(),id)).text(),'file input');
});
void test('failed deletion is retried; foreign prefixes, active references and registered originals are protected',async t=>{
  const f=fixture(t),id=randomUUID();await f.api.put(await req('PUT',form(payload())),id);const live=draftRow(f,id).source_key;
  const namespace=await noahSha256(new TextEncoder().encode('alice')),orphan=`noah/drafts/${namespace}/${randomUUID()}/${'c'.repeat(64)}`;
  const foreign=`noah/drafts/${await noahSha256(new TextEncoder().encode('bob'))}/${randomUUID()}/${'d'.repeat(64)}`;
  const privateKey=`noah/private/${namespace}/original`;f.blobs.set(orphan,new Uint8Array(4));f.blobs.set(foreign,new Uint8Array(4));f.blobs.set(privateKey,new Uint8Array(4));
  await f.storage.inventory('alice');await f.storage.collect('alice');f.time.now+=LIMIT.orphanMs+1;f.hooks.delete=async()=>{throw Error('down');};
  await assert.rejects(f.storage.collect('alice'),/down/);assert.equal((await f.storage.summary('alice')).pendingBytes,4);
  f.hooks.delete=null;await f.storage.collect('alice');assert.deepEqual(f.deleted,[orphan]);assert.ok(f.blobs.has(live));assert.ok(f.blobs.has(foreign));assert.ok(f.blobs.has(privateKey));
  // Even a legacy registered upload referencing a draft prefix fences removal.
  f.sql.prepare('UPDATE noah_agent_drafts SET source_key=NULL,source_name=NULL,source_bytes=NULL,source_sha256=NULL WHERE id=?').run(id);
  f.sql.prepare('INSERT INTO noah_agent_uploads(id,owner_id,manifest,manifest_sha256,upload_state,created_at,original_key) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),'alice','{}','a'.repeat(64),'ready',f.time.now,live);
  await f.storage.collect('alice');f.time.now+=LIMIT.orphanMs+1;await f.storage.collect('alice');assert.ok(f.blobs.has(live));
});
void test('registration consumes only the exact draft snapshot and keeps the separate registered original through purge',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload();await f.api.put(await req('PUT',p),id);
  const upload={id:randomUUID(),manifest:p.content.manifest,rightsConfirmed:true,code:{name:p.content.codeName,content:p.content.code},draft:{id,revision:1}};
  const response=await f.agents.create(await req('POST',upload));assert.equal(response.status,201);const saved=await response.json();assert.equal(saved.draftCleanup.state,'archived');
  const original=await(await f.agents.download(new Request('https://noah.example/?variant=original',{headers:{'test-owner':'alice'}}),upload.id)).text();
  assert.equal(original,p.content.code);assert.equal((await(await f.agents.create(await req('POST',upload))).json()).draftCleanup.state,'archived');
  await f.api.restore(await req('POST',{revision:2}),id);const replay=await(await f.agents.create(await req('POST',upload))).json();assert.equal(replay.draftCleanup.state,'kept_newer');assert.equal(draftRow(f,id).deleted_at,null);
  await f.api.remove(await req('DELETE',{revision:3}),id);f.time.now+=LIMIT.trashMs+1;await f.storage.collect('alice');f.time.now+=LIMIT.orphanMs+1;await f.storage.collect('alice');
  assert.equal(await(await f.agents.download(new Request('https://noah.example/?variant=original',{headers:{'test-owner':'alice'}}),upload.id)).text(),original);
});
void test('registration matches bundled fixed tests and refuses wrong source or another owners draft',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload();p.content.validation={enabled:false,testName:'test_main.py',testCode:'assert 6 * 7 == 42\n'};await f.api.put(await req('PUT',p),id);
  const uploadId=randomUUID(),file=await bundleUploadTest(new File([p.content.code],p.content.codeName),p.content.validation.testName,p.content.validation.testCode);
  const body=new FormData();body.set('id',uploadId);body.set('manifest',JSON.stringify(p.content.manifest));body.set('rightsConfirmed','true');body.set('source',file);body.set('draft',JSON.stringify({id,revision:1}));
  assert.equal((await f.agents.create(await req('POST',body,'bob'))).status,404);
  const mismatch={id:randomUUID(),manifest:p.content.manifest,rightsConfirmed:true,code:{name:'main.py',content:'print(100)'},draft:{id,revision:1}};
  assert.equal((await f.agents.create(await req('POST',mismatch))).status,409);assert.equal(draftRow(f,id).deleted_at,null);
  const result=await f.agents.create(await req('POST',body));assert.equal(result.status,201);assert.equal((await result.json()).draftCleanup.state,'archived');
});
void test('edit while upload is storing preserves the new draft and registration still succeeds',async t=>{
  const f=fixture(t),id=randomUUID(),p=payload();await f.api.put(await req('PUT',p),id);
  f.hooks.put=async key=>{if(key.startsWith('noah/private/')){f.hooks.put=null;const response=await f.api.put(await req('PUT',{...p,revision:1,commandId:randomUUID(),content:{...p.content,code:'print(100)'}}),id);assert.equal(response.status,200);}};
  const result=await f.agents.create(await req('POST',{id:randomUUID(),manifest:p.content.manifest,rightsConfirmed:true,code:{name:p.content.codeName,content:p.content.code},draft:{id,revision:1}}));
  assert.equal(result.status,201);assert.equal((await result.json()).draftCleanup.state,'kept_newer');assert.equal(draftRow(f,id).deleted_at,null);assert.equal(JSON.parse(draftRow(f,id).content).code,'print(100)');
});
void test('storage and restore enforce account/Origin boundaries and server-owned inventory cursor',async t=>{
  const f=fixture(t),id=randomUUID();await f.api.put(await req('PUT',payload()),id);await f.api.remove(await req('DELETE',{revision:1}),id);
  assert.equal((await(await f.api.storage(await req('GET',null,'bob'))).json()).storage.trash.length,0);
  assert.equal((await f.api.restore(await req('POST',{revision:2},'bob'),id)).status,409);
  assert.equal((await f.api.storage(await req('POST',{},'alice',{origin:'https://other.invalid'}))).status,403);
  assert.equal((await f.api.storage(await req('POST',{cursor:'foreign'}))).status,400);
  assert.equal((await f.api.storage(await req('POST',{}))).status,200);
});
void test('trash listing and legacy inventory page without losing protected or unreferenced objects',async t=>{
  const f=fixture(t),namespace=await noahSha256(new TextEncoder().encode('alice'));
  for(let i=0;i<101;i++)f.blobs.set(`noah/drafts/${namespace}/${randomUUID()}/${'b'.repeat(64)}`,new Uint8Array(4));
  await f.storage.inventory('alice');let s=await f.storage.summary('alice');assert.equal(s.scanPending,true);assert.equal(s.objects,100);
  await f.storage.inventory('alice');s=await f.storage.summary('alice');assert.equal(s.scanPending,false);assert.equal(s.objects,101);
  for(let i=0;i<35;i++){const id=randomUUID();await f.api.put(await req('PUT',payload()),id);await f.api.remove(await req('DELETE',{revision:1}),id);}
  s=await f.storage.summary('alice');assert.equal(s.trash.length,32);assert.ok(s.nextTrash);const next=await f.storage.summary('alice',s.nextTrash);assert.equal(next.trash.length,3);assert.equal(new Set([...s.trash,...next.trash].map(d=>d.id)).size,35);
});
