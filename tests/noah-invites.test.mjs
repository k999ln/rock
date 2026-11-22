import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID, randomBytes } from 'node:crypto';
import { createNoahInviteApi } from '../lib/noah-invites.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { noahAgentTemplate } from '../lib/noah-agent-upload.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const name of ['0033_noah_agent_uploads','0034_noah_upload_refactor','0037_noah_agent_invites','0039_noah_invite_execution']) sqlite.exec(readFileSync(new URL(`../drizzle/${name}.sql`,import.meta.url),'utf8'));
  let now = 1794798000000, beforeObjectRead = () => {};
  const uploadId = randomUUID();
  sqlite.prepare(`INSERT INTO noah_agent_uploads(id,owner_id,manifest,manifest_sha256,source_key,source_name,source_bytes,source_sha256,upload_state,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?)`).run(uploadId,'alice',JSON.stringify(noahAgentTemplate),'a'.repeat(64),'private-source','agent.ts',4,'b'.repeat(64),'ready',now);
  const db = { prepare(sql) { return { bind(...args) { return { async first() { return sqlite.prepare(sql).get(...args) ?? null; }, async all() { return { results: sqlite.prepare(sql).all(...args) }; } }; } }; } };
  const api = createNoahInviteApi({ db, authenticate: async r => { const owner = r.headers.get('test-owner'); if (!owner) throw new Error('UNAUTHORIZED'); return owner; }, clock: () => now,
    bucket: { async get() { beforeObjectRead(); return { body:'code' }; } } });
  const request = async (method='GET',body=null,owner='alice',headers={},query='') => new Request('https://noah.example/api/noah/invites'+query,{method,headers:{'test-owner':owner,origin:'https://noah.example','content-type':'application/json','x-rock-owner-scope':await ownerScopeFor(owner),...headers},...(body ? {body:JSON.stringify(body)} : {})});
  const value = (patch={}) => ({ id:randomUUID(),agentId:uploadId,token:randomBytes(32).toString('hex'),recipient:null,access:'view',expiresAt:now+60000,maxUses:1,...patch });
  return { api,request,value,sqlite,uploadId,setNow:value=>{now=value;},onObjectRead:callback=>{beforeObjectRead=callback;} };
}
void test('issuing a fixed-source invitation is owner scoped, idempotent, and stores no bearer token', async t => {
  const {api,request,value,sqlite}=fixture(t), v=value();
  assert.equal((await api.create(await request('POST',v))).status,201);
  assert.equal((await api.create(await request('POST',v))).status,200);
  assert.equal((await api.create(await request('POST',{...v,maxUses:2}))).status,409);
  assert.equal((await api.create(await request('POST',value(),'bob'))).status,409);
  const own=await (await api.list(await request())).json(),other=await (await api.list(await request('GET',null,'bob'))).json();
  assert.equal(own.invites.length,1);assert.deepEqual(other.invites,[]);
  assert.ok(!JSON.stringify(own).includes(v.token));assert.ok(!JSON.stringify(sqlite.prepare('SELECT * FROM noah_agent_invites').all()).includes(v.token));
  assert.equal((await api.get(await request('GET',null,'bob'),v.id)).status,404);
  assert.equal((await api.create(await request('POST',value(),'alice',{origin:'https://other.example'}))).status,403);
  assert.equal((await api.create(await request('POST',value(),'alice',{'x-rock-owner-scope':await ownerScopeFor('bob')}))).status,409);
  assert.equal((await api.list(new Request('https://noah.example/api/noah/invites'))).status,401);
});
void test('atomic recipient admission permits one winner, counts a retry once, and rejects wrong tokens', async t => {
  const {api,request,value,sqlite}=fixture(t),v=value();await api.create(await request('POST',v));
  const response=await Promise.all(['bob','charlie'].map(async owner=>api.claim(await request('POST',{token:v.token},owner),v.id)));
  assert.deepEqual(response.map(r=>r.status).sort((a,b)=>a-b),[200,404]);
  const winner=response[0].ok?'bob':'charlie', loser=winner==='bob'?'charlie':'bob';
  assert.equal((await api.claim(await request('POST',{token:v.token},winner),v.id)).status,200);
  assert.equal((await api.claim(await request('POST',{token:'0'.repeat(64)},winner),v.id)).status,404);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM noah_agent_invite_claims').get().n,1);
  assert.equal((await api.get(await request('GET',null,loser),v.id)).status,404);
  const result=await (await api.get(await request('GET',null,winner),v.id)).json();
  assert.equal(result.agent.access,'view');assert.equal(result.agent.source,null);
  assert.equal((await api.download(await request('GET',null,winner),v.id)).status,404);
  const received=await (await api.list(await request('GET',null,winner,{},'?received=1'))).json();assert.equal(received.shared.length,1);
});
void test('named recipient, expiration, revocation and read/download use the same live grant', async t => {
  const {api,request,value,setNow}=fixture(t),v=value({recipient:'bob',access:'source',maxUses:2});await api.create(await request('POST',v));
  assert.equal((await api.claim(await request('POST',{token:v.token},'charlie'),v.id)).status,404);
  assert.equal((await api.claim(await request('POST',{token:v.token},'bob'),v.id)).status,200);
  const download=await api.download(await request('GET',null,'bob'),v.id);
  assert.equal(download.status,200);assert.equal(await download.text(),'code');assert.match(download.headers.get('content-disposition'),/^attachment/);assert.match(download.headers.get('content-security-policy'),/sandbox/);
  assert.equal((await api.revoke(await request('DELETE',{revision:1},'bob'),v.id)).status,409);
  assert.equal((await api.revoke(await request('DELETE',{revision:1}),v.id)).status,200);
  assert.equal((await api.revoke(await request('DELETE',{revision:1}),v.id)).status,200);
  for(const method of ['get','download'])assert.equal((await api[method](await request('GET',null,'bob'),v.id)).status,404);
  assert.equal((await api.claim(await request('POST',{token:v.token},'bob'),v.id)).status,404);
  assert.deepEqual((await (await api.list(await request('GET',null,'bob',{},'?received=1'))).json()).shared,[]);
  const other=value();await api.create(await request('POST',other));await api.claim(await request('POST',{token:other.token},'bob'),other.id);setNow(other.expiresAt);
  assert.equal((await api.get(await request('GET',null,'bob'),other.id)).status,404);
  assert.equal((await api.claim(await request('POST',{token:other.token},'bob'),other.id)).status,404);
});
void test('source deletion, digest change, and revocation during object lookup fence further downloads', async t => {
  const {api,request,value,sqlite,uploadId,onObjectRead}=fixture(t),v=value({access:'source'});await api.create(await request('POST',v));await api.claim(await request('POST',{token:v.token},'bob'),v.id);
  sqlite.prepare('UPDATE noah_agent_uploads SET source_sha256=? WHERE id=?').run('c'.repeat(64),uploadId);
  assert.equal((await api.get(await request('GET',null,'bob'),v.id)).status,404);
  sqlite.prepare('UPDATE noah_agent_uploads SET source_sha256=?,deleted_at=1 WHERE id=?').run('b'.repeat(64),uploadId);
  assert.equal((await api.download(await request('GET',null,'bob'),v.id)).status,404);
  sqlite.prepare('UPDATE noah_agent_uploads SET deleted_at=NULL WHERE id=?').run(uploadId);
  onObjectRead(()=>sqlite.prepare('UPDATE noah_agent_invites SET revoked_at=1 WHERE id=?').run(v.id));
  assert.equal((await api.download(await request('GET',null,'bob'),v.id)).status,404);
});
void test('invite limits reject unknown grants, malformed input and a missing source before publishing authority', async t => {
  const {api,request,value,sqlite,uploadId}=fixture(t);
  for(const patch of [{access:'install'},{maxUses:0},{maxUses:101},{expiresAt:0},{expiresAt:1794798000000+31*86400000},{recipient:'\n'},{owner:'bob'}]) assert.equal((await api.create(await request('POST',value(patch)))).status,400);
  sqlite.prepare('UPDATE noah_agent_uploads SET source_key=NULL,source_name=NULL,source_bytes=NULL,source_sha256=NULL WHERE id=?').run(uploadId);
  assert.equal((await api.create(await request('POST',value({access:'source'})))).status,409);
  for(let i=0;i<100;i++)assert.equal((await api.create(await request('POST',value()))).status,201);
  assert.equal((await api.create(await request('POST',value()))).status,409);
});
