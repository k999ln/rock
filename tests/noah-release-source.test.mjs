import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createNoahPublisherApi } from '../lib/noah-publisher.ts';
import { createNoahReleaseApi } from '../lib/noah-release.ts';
import { noahAgentStore } from '../lib/noah-agent-store.ts';
import { noahAgentTemplate, noahSha256 } from '../lib/noah-agent-upload.ts';
import { noahArtifactKey } from '../lib/noah-artifact.ts';
import { createSkyToolPackageDraft, parseSkyToolPackage, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { skyToolPackageStore } from '../lib/sky-tool-package-store.ts';
import { parseSkyToolReview, skyToolReviewStore, SKY_REVIEW_CHECKS } from '../lib/sky-tool-review.ts';
import { skyCommerceStore } from '../lib/sky-commerce-store.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const origin='https://noah.example';
const confirmations={rights:true,pricing:true,sideEffects:true,tests:true,distributeSource:true};
async function fixture(t) {
  const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
  for(const name of ['0021_sites_schema_convergence.sql','0033_noah_agent_uploads.sql','0034_noah_upload_refactor.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8'));
  const statement=(sql,values=[])=>({bind:(...args)=>statement(sql,args),async first(){return sqlite.prepare(sql).get(...values)||null;},async all(){const results=sqlite.prepare(sql).all(...values);return{results,meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}};}});
  const db={prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const result=[];for(const s of items)result.push(await s.all());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const blobs=new Map();let afterGet;
  const bucket={async put(key,bytes){blobs.set(key,new Uint8Array(bytes));},async get(key){const bytes=blobs.get(key);if(afterGet)await afterGet(key);return bytes?{body:new Response(bytes).body}:null;}};
  const authenticate=async r=>{const owner=r.headers.get('test-owner');if(!owner)throw new Error('UNAUTHORIZED');return owner;};
  const uploadStore=noahAgentStore(db,'alice'), bytes=new TextEncoder().encode('export const answer = 42;\n'), hash=await noahSha256(bytes), id=randomUUID();
  const manifest={...noahAgentTemplate,id:'test-source',adapter:'source',endpointUrl:null}, manifestHash=await noahSha256(new TextEncoder().encode(JSON.stringify(manifest)));
  const source={key:'private-test-source',name:'agent.mjs',bytes:bytes.length,sha256:hash};
  await uploadStore.reserve({id,manifest,manifestSha256:manifestHash,source});await bucket.put(source.key,bytes);
  await uploadStore.complete(id,source,{engine:'noah-source-refactor/1',status:'unchanged',validation:'not_run',message:'fixture',changes:[]});
  const pkg=createSkyToolPackageDraft({sourceKind:'inline_code',fileName:'agent.mjs',name:'Source fixture',summary:'This is a synthetic source distribution fixture only.',developerName:'Alice',developerId:'alice',license:'MIT'});
  const body={manifest:pkg,confirmations,upload:{id,manifestSha256:manifestHash,sourceSha256:hash}};
  const api=createNoahPublisherApi({db,bucket,authenticate}),release=createNoahReleaseApi({db,bucket,authenticate,mode:'test'});
  const request=async(value,owner='alice')=>new Request(origin+'/api/noah/publisher',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','test-owner':owner,'X-Rock-Owner-Scope':await ownerScopeFor(owner)},body:JSON.stringify(value)});
  const save=async(value=body,owner='alice')=>api.create(await request(value,owner));
  const download=(p,owner='bob',target=release)=>target.download(new Request(origin+'/source?manifest='+p.manifestSha256,{headers:{'test-owner':owner}}),p.packageKey);
  const review=(p,patch={})=>skyToolReviewStore(db).review('independent-test-reviewer',parseSkyToolReview({packageKey:p.packageKey,manifestSha256:p.manifestSha256,decision:'verified',sourceRevision:hash,sourceSha256:hash,checks:Object.fromEntries(SKY_REVIEW_CHECKS.map(k=>[k,true])),evidenceUrls:['https://example.com/synthetic-evidence'],notes:'Synthetic fixture only, not a real market review.',expiresAt:Date.now()+86400001,...patch}));
  return{db,sqlite,blobs,bucket,body,save,download,review,release,bytes,id,hash,uploadStore,authenticate,onGet(fn){afterGet=fn;}};
}
await test('publication pins owned bytes and source provenance; no implicit disclosure, no forged binding',async t=>{
  const f=await fixture(t);
  assert.equal((await f.save({...f.body,confirmations:{...confirmations,distributeSource:false}})).status,400);
  assert.equal((await f.save(f.body,'bob')).status,409);
  const r=await f.save();assert.equal(r.status,201);const p=(await r.json()).package, a=p.manifest.source.artifact;
  assert.equal(a.uploadId,f.id);assert.equal(a.sha256,f.hash);assert.equal(a.originalSha256,f.hash);
  assert.equal(p.status,'submitted');assert.equal(p.installable,false);
  assert.equal((await f.save()).status,200);
  assert.equal((await f.download(p,'alice')).status,200);assert.equal((await f.download(p)).status,409);
  assert.equal((await f.save({...f.body,manifest:p.manifest})).status,400);
  assert.equal(await skyToolPackageStore(f.db).create('bob',{...p.manifest,id:'dev.bob.stolen'}),null);
  assert.notEqual(await skyToolPackageSha256(f.body.manifest),p.manifestSha256);
  assert.deepEqual(parseSkyToolPackage(p.manifest).source.artifact,a);
});
await test('review matches exact code; verified free distribution retains snapshot after private deletion and refuses revocation races',async t=>{
  const f=await fixture(t), p=(await(await f.save()).json()).package;
  await assert.rejects(f.review(p,{sourceSha256:'b'.repeat(64)}),e=>e.status===409);
  await f.review(p);
  const result=await f.download(p);assert.equal(result.status,200);assert.deepEqual(new Uint8Array(await result.arrayBuffer()),f.bytes);
  await f.uploadStore.remove(f.id);f.blobs.delete('private-test-source');
  assert.equal((await f.save()).status,200,'identical publication retry survives private registration removal');
  assert.equal((await f.download(p)).status,200,'release retains separate pinned snapshot');
  f.onGet(()=>f.sqlite.prepare("UPDATE sky_tool_packages SET status='revoked' WHERE package_key=?").run(p.packageKey));
  assert.equal((await f.download(p)).status,409,'recheck after reading storage');
  assert.equal((await f.download(p,'alice')).status,200,'author retains their own version');
});
await test('paid artifact access follows the exact buyer, reviewed version and payment mode, and fails after refund',async t=>{
  const f=await fixture(t);f.body.manifest.pricing.model='usage';
  const p=(await(await f.save()).json()).package;await f.review(p);
  assert.equal((await f.download(p)).status,403);
  const orderId=randomUUID();
  f.sqlite.prepare(`INSERT INTO sky_commerce_orders(id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,commission_minor,currency,account_id,offer_revision,terms_url,refund_policy,status,active_key,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId,'bob','alice','test',p.packageKey,p.manifestSha256,'fixture',100,0,'jpy','fixture-account',1,'https://example.com/terms','fixture','pending',JSON.stringify(['test','bob',p.packageKey]),Date.now(),Date.now());
  assert.equal((await f.download(p)).status,403);
  f.sqlite.prepare("UPDATE sky_commerce_orders SET status='paid' WHERE id=?").run(orderId);
  assert.equal((await f.download(p)).status,200);assert.equal((await f.download(p,'charlie')).status,403);
  const live=createNoahReleaseApi({db:f.db,bucket:f.bucket,authenticate:f.authenticate,mode:'live'});
  assert.equal((await f.download(p,'bob',live)).status,403);
  f.onGet(()=>f.sqlite.prepare("UPDATE sky_commerce_orders SET status='refunded' WHERE id=?").run(orderId));
  assert.equal((await f.download(p)).status,403);
  assert.equal((await skyCommerceStore(f.db).activeOrder('bob',p.packageKey,'test')).status,'refunded');
});
await test('source corruption, stale references and private deletion during publication cannot create a distributable package',async t=>{
  const f=await fixture(t);
  assert.equal((await f.save({...f.body,upload:{...f.body.upload,sourceSha256:'0'.repeat(64)}})).status,409);
  f.blobs.set('private-test-source',new Uint8Array(f.bytes.length).fill(65));assert.equal((await f.save()).status,409);
  f.blobs.set('private-test-source',f.bytes);f.onGet(()=>f.uploadStore.remove(f.id));assert.equal((await f.save()).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_tool_packages').get().n,0);
  assert.ok(f.blobs.has(await noahArtifactKey('alice',f.hash)),'failed publication snapshot is retained for later reference-aware GC');
});
await test('review rejects malformed or changed stored manifests without approving them; legacy packages without an artifact remain reviewable',async t=>{
  const f=await fixture(t);
  const p=(await(await f.save({manifest:f.body.manifest,confirmations})).json()).package;
  assert.equal(p.manifest.source.artifact,undefined);
  for(const manifest of ['{}','null','invalid json',JSON.stringify({...p.manifest,summary:'Different source than the manifest hash under review.'})]){
    f.sqlite.prepare('UPDATE sky_tool_packages SET manifest=? WHERE package_key=?').run(manifest,p.packageKey);
    await assert.rejects(f.review(p),e=>e.status===409);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_tool_package_reviews').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT status FROM sky_tool_packages WHERE package_key=?').get(p.packageKey).status,'submitted');
  }
  f.sqlite.prepare('UPDATE sky_tool_packages SET manifest=? WHERE package_key=?').run(JSON.stringify(p.manifest),p.packageKey);
  await f.review(p);
  assert.equal(f.sqlite.prepare('SELECT status FROM sky_tool_packages WHERE package_key=?').get(p.packageKey).status,'verified');
});
await test('an existing service grant permits only its exact reviewed source and is rechecked after storage reads',async t=>{
  const f=await fixture(t);f.body.manifest.pricing.model='external_contract';
  const p=(await(await f.save()).json()).package;await f.review(p);
  f.sqlite.prepare(`INSERT INTO rockstar_service_entitlements
    (issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at,revoked_at)
    VALUES('fixture','test-claim','bob','existing-offer',?,?,'esim','["agents"]','test-key','test-signature','active',?,NULL,NULL)`).run('a'.repeat(64),'b'.repeat(64),Date.now());
  const profiles=hash=>JSON.stringify({schema:'rockstar-service-offer-profiles/1',profiles:[{issuerId:'fixture',offerId:'existing-offer',profileId:'existing',version:'1.0.0',label:'Existing fixture grant',packages:[{packageKey:p.packageKey,manifestSha256:hash}]}]});
  const release=hash=>createNoahReleaseApi({db:f.db,bucket:f.bucket,authenticate:f.authenticate,serviceOfferProfiles:profiles(hash),mode:'test'});
  assert.equal((await f.download(p,'bob',release('0'.repeat(64)))).status,403);
  assert.equal((await f.download(p,'charlie',release(p.manifestSha256))).status,403);
  assert.equal((await f.download(p,'bob',release(p.manifestSha256))).status,200);
  f.onGet(()=>f.sqlite.prepare("UPDATE rockstar_service_entitlements SET status='revoked',revoked_at=? WHERE claim_id='test-claim'").run(Date.now()));
  assert.equal((await f.download(p,'bob',release(p.manifestSha256))).status,403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM sky_commerce_orders').get().n,0);
});
