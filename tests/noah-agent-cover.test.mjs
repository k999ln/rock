import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createNoahInviteApi } from '../lib/noah-invites.ts';
import { createNoahAgentApi } from '../lib/noah-agent-api.ts';
import { noahAgentTemplate } from '../lib/noah-agent-upload.ts';
import { NOAH_COVER_LIMIT, noahPrivateCoverUrl, noahReleaseCoverUrl } from '../lib/noah-cover.ts';
import { releaseRuntimeFixture } from './helpers/noah-release-runtime-fixture.mjs';
import { createNoahLibraryApi } from '../lib/noah-library.ts';
import { createNoahPublisherApi } from '../lib/noah-publisher.ts';
import { createSkyToolPackageDraft } from '../lib/sky-tool-package.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const origin = 'https://noah.example';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6cN8AAAAASUVORK5CYII=', 'base64');
const cover = () => new File([png], 'cover.png', { type: 'image/png' });
const confirmations = { rights: true, pricing: true, sideEffects: true, tests: true };
const envelope = () => ({ manifest: createSkyToolPackageDraft({ sourceKind:'github', sourceUrl:'https://github.com/example/covers', developerName:'Fixture', developerId:'fixture', license:'MIT' }), confirmations });
const registration = id => ({ id, manifest: noahAgentTemplate, rightsConfirmed: true });
function setup(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const name of ['0021_sites_schema_convergence.sql', '0033_noah_agent_uploads.sql', '0034_noah_upload_refactor.sql','0037_noah_agent_invites.sql','0039_noah_invite_execution.sql'])
    sqlite.exec(readFileSync(new URL('../drizzle/' + name, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    first: async () => sqlite.prepare(sql).get(...args) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
  }; } }; } };
  const objects = new Map();
  let failWrites = false, afterGet;
  const bucket = {
    async put(key, bytes, options) { if (failWrites) throw Error('failed write'); objects.set(key, { bytes, ...options }); },
    async get(key, opts) {
      const item = objects.get(key);
      if (afterGet) await afterGet();
      if (!item) return null;
      const range = opts?.range;
      const body = range ? item.bytes.slice(range.offset, range.offset + range.length) : item.bytes;
      return { size: item.bytes.length, ...item, body: new Response(body).body };
    },
  };
  const authenticate = async req => { const who = req.headers.get('test-owner'); if (!who) throw Error('UNAUTHORIZED'); return who; };
  return { sqlite, objects, invites:createNoahInviteApi({db,bucket,authenticate}), onRead: fn => {afterGet=fn;}, failWrites: value => { failWrites = value; }, agents: createNoahAgentApi({ db, bucket, authenticate }), publisher: createNoahPublisherApi({ db, bucket, authenticate }) };
}

async function request(url, { owner, body, file, method, headers = {} } = {}) {
  const h = new Headers(headers);
  if (owner) h.set('test-owner', owner);
  let data;
  if (body) {
    h.set('Origin', origin); h.set('X-Rock-Owner-Scope', await ownerScopeFor(owner));
    if (file) { const f = new FormData(); f.set('payload', JSON.stringify(body)); f.set('cover', file); data = f; }
    else { h.set('Content-Type', 'application/json'); data = JSON.stringify(body); }
  }
  return new Request(origin + url, { method: method || (body ? 'POST' : 'GET'), headers: h, body: data });
}
void test('private media and the published edition retain the exact cover, byte ranges and separate read permissions', async t => {
  const f = setup(t), id = randomUUID(), url = noahPrivateCoverUrl(id), body = registration(id);
  const save = () => request('/api/noah/agents', { owner:'alice', body, file:cover() }).then(f.agents.create);
  const saved = await save();
  assert.equal(saved.status, 201);
  const pin = (await saved.json()).agent.manifest.cover;
  assert.equal(pin.type,'image/png'); assert.equal(pin.bytes,png.length);
  assert.equal((await save()).status,200); assert.equal(f.objects.size,1);
  assert.equal((await f.agents.cover(await request(url),id)).status,401);
  assert.equal((await f.agents.cover(await request(url,{owner:'bob'}),id)).status,404);
  const initial = await f.agents.cover(await request(url,{owner:'alice'}),id);
  assert.equal(initial.headers.get('Content-Type'),'image/png'); assert.deepEqual(Buffer.from(await initial.arrayBuffer()),png);
  const pkg = { ...envelope(), coverUploadId:id };
  assert.equal((await f.publisher.create(await request('/api/noah/publisher',{owner:'bob',body:pkg}))).status,409);
  const release = (await (await f.publisher.create(await request('/api/noah/publisher',{owner:'alice',body:pkg}))).json()).package;
  assert.deepEqual(release.manifest.cover,pin);
  const link = noahReleaseCoverUrl(release.packageKey,release.manifestSha256);
  const read = async (owner,range) => f.publisher.cover(await request(link,{owner,headers:range?{Range:range}:{}}),release.packageKey);
  assert.equal((await read()).status,404); assert.equal((await read('bob')).status,404);
  assert.equal((await read('alice')).status,200);
  const submit = {action:'submit',packageKey:release.packageKey,manifestSha256:release.manifestSha256,status:'submitted'};
  assert.equal((await f.publisher.transition(await request('/api/noah/publisher',{owner:'alice',method:'PATCH',body:submit}))).status,200);
  assert.equal((await read()).status,404);
  f.sqlite.prepare("UPDATE sky_tool_packages SET status='verified' WHERE package_key=?").run(release.packageKey);
  const observed = Date.now();
  f.sqlite.prepare("INSERT INTO sky_tool_package_reviews(id,package_key,manifest_sha256,reviewer_id,decision,checks_json,evidence_json,notes,reviewed_at,expires_at) VALUES('review',?,?,'independent','verified','{}','{}','',?,?)").run(release.packageKey,release.manifestSha256,observed,observed+3_600_000);
  const chunk = await read(null,'bytes=0-1'); assert.equal(chunk.status,206); assert.equal(chunk.headers.get('Content-Range'),'bytes 0-1/'+png.length); assert.deepEqual(Buffer.from(await chunk.arrayBuffer()),png.subarray(0,2));
  assert.equal((await read(null,'bytes=9000-')).status,416);
  assert.equal((await f.publisher.cover(await request(noahReleaseCoverUrl(release.packageKey,'1'.repeat(64))),release.packageKey)).status,404);
  const clock = t.mock.method(Date,'now',()=>observed + 3_600_001);
  assert.equal((await read()).status,404); clock.mock.restore();
  assert.equal((await f.publisher.transition(await request('/api/noah/publisher',{owner:'alice',method:'PATCH',body:{...submit,action:'withdraw',status:'verified'}}))).status,200);
  assert.equal((await read('bob')).status,404); assert.equal((await read('alice')).status,200);
});

void test('a generated or uploaded video pins identical bytes; a failed write retries on the same edition before review',async t=>{
  const f=setup(t), payload=envelope();
  // WebM EBML header carrying its actual DocType, as also written by MediaRecorder.
  const bytes=Uint8Array.from([0x1a,0x45,0xdf,0xa3,0x9f,0x42,0x86,0x81,0x01,0x42,0x82,0x84,0x77,0x65,0x62,0x6d,0x42,0x87,0x81,0x04]);
  const file=new File([bytes],'generated.webm',{type:'video/webm;codecs=vp8'});
  const save = async (body,media) => f.publisher.create(await request('/api/noah/publisher',{owner:'alice',body,file:media}));
  f.failWrites(true); assert.equal((await save(payload,file)).status,503); f.failWrites(false);
  const [pending]=(await (await f.publisher.list(await request('/api/noah/publisher',{owner:'alice'}))).json()).packages;
  const action={action:'submit',packageKey:pending.packageKey,manifestSha256:pending.manifestSha256,status:pending.status};
  assert.equal((await f.publisher.transition(await request('/api/noah/publisher',{owner:'alice',method:'PATCH',body:action}))).status,503);
  assert.equal((await save(payload,cover())).status,409);
  const saved=await save(payload,file);assert.equal(saved.status,200);assert.equal((await saved.json()).package.manifest.cover.type,'video/webm');
  const video=await f.publisher.cover(await request(noahReleaseCoverUrl(pending.packageKey,pending.manifestSha256),{owner:'alice'}),pending.packageKey);
  assert.equal(video.headers.get('content-type'),'video/webm');assert.deepEqual(new Uint8Array(await video.arrayBuffer()),bytes);
});

void test('content mismatch, oversize, untrusted pins, and legacy no-cover results remain distinct',async t=>{
  const f=setup(t), id=randomUUID(), body=registration(id);
  const files=[new File([png],'fake.webp',{type:'image/webp'}),new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],'cover.svg',{type:'image/svg+xml'}),new File([new Uint8Array(NOAH_COVER_LIMIT+1)],'big.mp4',{type:'video/mp4'})];
  for(const [index,file] of files.entries()) assert.equal((await f.agents.create(await request('/api/noah/agents',{owner:'alice',body,file}))).status,index===2?413:415);
  assert.equal(f.objects.size,0); assert.equal((await f.agents.create(await request('/api/noah/agents',{owner:'alice',body}))).status,201);
  assert.equal((await f.agents.cover(await request(noahPrivateCoverUrl(id),{owner:'alice'}),id)).status,404);
  const bad={...envelope()};bad.manifest.cover={type:'image/png',bytes:png.length,sha256:'0'.repeat(64)};
  assert.equal((await f.publisher.create(await request('/api/noah/publisher',{owner:'alice',body:bad}))).status,400);
});

void test('a cover-only registration stays pending on a failed write and recovers with the exact saved pin',async t=>{
  const f=setup(t), id=randomUUID(), body=registration(id);
  const save=async (payload,file)=>f.agents.create(await request('/api/noah/agents',{owner:'alice',body:payload,file}));
  f.failWrites(true); assert.equal((await save(body,cover())).status,503); f.failWrites(false);
  const pending=(await (await f.agents.get(await request('/api/noah/agents/'+id,{owner:'alice'}),id)).json()).agent;
  assert.equal(pending.uploadState,'pending');
  assert.equal((await save({...body, manifest:pending.manifest})).status,503);
  assert.equal((await save({...body, id:randomUUID(),manifest:pending.manifest})).status,409);
  const restored=await save({...body,manifest:pending.manifest},cover());
  assert.equal(restored.status,200);assert.equal((await restored.json()).agent.uploadState,'ready');
  assert.equal((await save({...body,manifest:pending.manifest})).status,200);
});
void test('view invitations reveal the pinned cover to the claimed recipient until revocation, including during a storage read',async t=>{
  const f=setup(t), id=randomUUID(), body=registration(id);
  assert.equal((await f.agents.create(await request('/api/noah/agents',{owner:'alice',body,file:cover()}))).status,201);
  const invite={id:randomUUID(),agentId:id,token:'a'.repeat(64),recipient:'bob',access:'view',expiresAt:Date.now()+60000,maxUses:1};
  assert.equal((await f.invites.create(await request('/api/noah/invites',{owner:'alice',body:invite}))).status,201);
  const read=async owner=>f.invites.cover(await request('/api/noah/invites/'+invite.id+'/cover',{owner}),invite.id);
  assert.equal((await read('bob')).status,404);
  assert.equal((await f.invites.claim(await request('/api/noah/invites',{owner:'bob',body:{token:invite.token}}),invite.id)).status,200);
  assert.equal((await read('charlie')).status,404);
  assert.equal((await f.agents.cover(await request(noahPrivateCoverUrl(id),{owner:'bob'}),id)).status,404);
  const response=await read('bob');assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
  f.onRead(async()=>{f.onRead(null);await f.invites.revoke(await request('/api/noah/invites',{owner:'alice',method:'DELETE',body:{revision:1}}),invite.id);});
  assert.equal((await read('bob')).status,404);assert.equal((await read('bob')).status,404);
});

void test('an author and the buyer see the cover pinned to their exact runtime edition in the library',async t=>{
  const f=await releaseRuntimeFixture();t.after(()=>f.close());
  f.sqlite.exec(readFileSync(new URL('../drizzle/0030_sky_agent_settings.sql',import.meta.url),'utf8'));
  const original=await f.uploads.get(f.id), manifest=structuredClone(f.p.manifest);
  delete manifest.source.artifact;manifest.version='2.1.0';
  const publish=createNoahPublisherApi(f.deps);
  const payload={ manifest, confirmations:{...confirmations,distributeSource:true}, upload:{id:f.id,manifestSha256:original.manifestSha256,sourceSha256:original.source.sha256} };
  const saved=await publish.create(await request('/api/noah/publisher',{owner:'author-fixture',body:payload,file:cover()}));
  assert.equal(saved.status,201);
  const edition=(await saved.json()).package;
  f.purchase();
  f.sqlite.prepare('UPDATE sky_commerce_orders SET package_key=?,manifest_sha256=? WHERE buyer_user_id=?').run(edition.packageKey,edition.manifestSha256,'buyer-fixture');
  const library=createNoahLibraryApi({...f.deps,mode:'test'});
  const entries=async owner=>(await (await library(await request('/api/noah/library',{owner}))).json()).releases;
  assert.deepEqual((await entries('author-fixture')).find(p=>p.packageKey===edition.packageKey).cover,edition.manifest.cover);
  assert.deepEqual((await entries('buyer-fixture')).map(p=>[p.packageKey,p.cover]),[[edition.packageKey,edition.manifest.cover]]);
  assert.deepEqual(await entries('unrelated'),[]);
});
