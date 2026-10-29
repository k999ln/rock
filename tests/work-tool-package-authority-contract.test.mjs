import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WORK_TOOL_PACKAGE_AUTHORITY_ROOT_STATUS, WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA, readWorkToolPackageAuthorityReference, workToolPackageAuthorityConsistency} from '../lib/work-tool-package-authority-contract.ts';
import {createWorkJob,applyWorkCommand} from '../lib/workflow.ts';
import {randomUUID} from 'node:crypto';
import {loadRouteFixture} from './route-fixture.mjs';
import * as auth from '../lib/request-auth.ts';
const reference={schema:WORK_TOOL_PACKAGE_AUTHORITY_REFERENCE_SCHEMA,authorityId:'fixture-grant',revision:1,ownerUserId:'alice',issuerId:'fixture-issuer',claimId:'fixture-claim',offerId:'fixture-offer',packageKey:'dev.fixture.counter@1.0.0',manifestSha256:'a'.repeat(64)};
function fixture(t,file=':memory:'){
 const db=new DatabaseSync(file);t.after(()=>{if(db.isOpen)db.close();});
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 db.exec(readFileSync(new URL('./fixtures/work-tool-package-authority.sql',import.meta.url),'utf8'));
 const now=Date.now();
 db.prepare('INSERT INTO rockstar_service_entitlements(issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('fixture-issuer','fixture-claim','alice','fixture-offer','b'.repeat(64),'c'.repeat(64),'service_only','["sky","zema"]','fixture-key','not-a-production-signature','active',now-1000,now+60000);
 db.prepare('INSERT INTO work_tool_package_authorities VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run('fixture-grant',1,'alice','fixture-issuer','fixture-claim','fixture-offer',reference.packageKey,reference.manifestSha256,'fixture_only','fixture-only:unbound-root','active',now-1000,now+60000,null);
 return db;
}
function seedJob(db,id='job',ref=reference) {db.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(id,'alice',JSON.stringify({status:'active',attempt:'pending',packageKey:ref.packageKey,manifestSha256:ref.manifestSha256,authorityId:ref.authorityId,authorityRevision:ref.revision,toolPackageAuthorityReference:structuredClone(ref)}),0,new Date().toISOString());}
function claim(db,ref=reference,id='job',owner='alice',revision=0){
 const guard=workToolPackageAuthorityConsistency(ref);if(!guard)return 0;
 // The authenticated owner and exact job/Package context are independent inputs;
 // a passive authority reference cannot select someone else's job or Package.
 if(ref.ownerUserId!==owner)return 0;
 return Number(db.prepare(`UPDATE work_jobs SET payload=json_set(payload,'$.attempt','claimed'),revision=revision+1
 WHERE id=? AND user_id=? AND revision=? AND json_extract(payload,'$.status')='active'
 AND json_extract(payload,'$.attempt')='pending'
 AND json_extract(payload,'$.packageKey')=? AND json_extract(payload,'$.manifestSha256')=?
 AND json_extract(payload,'$.authorityId')=? AND json_extract(payload,'$.authorityRevision')=? AND ${guard.sql}`).run(id,owner,revision,ref.packageKey,ref.manifestSha256,ref.authorityId,ref.revision,...guard.bindings).changes);
}
void test('fixture grant persists its exact non-secret owner/contract/Package/version reference and allows one same-CAS transition',t=>{
 const db=fixture(t);seedJob(db);assert.equal(WORK_TOOL_PACKAGE_AUTHORITY_ROOT_STATUS,'unbound_fixture_only');
 assert.deepEqual(readWorkToolPackageAuthorityReference(structuredClone(reference)),reference);
 assert.equal(db.prepare('SELECT revision FROM work_tool_package_authorities WHERE authority_id=?').get(reference.authorityId).revision,1);
 assert.equal(claim(db),1);assert.equal(claim(db),0);assert.equal(db.prepare('SELECT revision FROM work_jobs').get().revision,1);
});
void test('owner, contract, Package and manifest substitutions are denied without mutating the job',t=>{
 const db=fixture(t);seedJob(db);
 for(const patch of [{ownerUserId:'bob'},{issuerId:'another'},{claimId:'another'},{offerId:'another'},{authorityId:'another'},{revision:2},{packageKey:'dev.other.tool@1.0.0'},{manifestSha256:'d'.repeat(64)}])assert.equal(claim(db,{...reference,...patch}),0,JSON.stringify(patch));
 assert.equal(db.prepare('SELECT revision FROM work_jobs').get().revision,0);
});
void test('grant deletion, supersession, expiry and contract loss after a successful read lose the same job CAS',t=>{
 const changes=["DELETE FROM work_tool_package_authorities","UPDATE work_tool_package_authorities SET state='revoked',revoked_at=1,revision=2","UPDATE work_tool_package_authorities SET state='superseded',revoked_at=1,revision=2","UPDATE work_tool_package_authorities SET issued_at=0,expires_at=1","UPDATE work_tool_package_authorities SET owner_user_id='bob'","UPDATE work_tool_package_authorities SET package_key='dev.other.tool@1.0.0',revision=2","UPDATE work_tool_package_authorities SET manifest_sha256='"+'d'.repeat(64)+"',revision=2","UPDATE rockstar_service_entitlements SET status='revoked',revoked_at=1","UPDATE rockstar_service_entitlements SET expires_at=1","UPDATE rockstar_service_entitlements SET owner_user_id='bob'","UPDATE rockstar_service_entitlements SET offer_id='replacement'"];
 for(const mutation of changes){const db=fixture(t);seedJob(db);assert.ok(db.prepare('SELECT * FROM work_tool_package_authorities').get());db.exec(mutation);assert.equal(claim(db),0,mutation);assert.equal(db.prepare('SELECT revision FROM work_jobs').get().revision,0);}
});
void test('revision update serializes writers and an old reference cannot borrow the new grant',t=>{
 const db=fixture(t);seedJob(db);
 const update=()=>Number(db.prepare('UPDATE work_tool_package_authorities SET revision=revision+1 WHERE authority_id=? AND revision=?').run(reference.authorityId,1).changes);
 assert.equal(update(),1);assert.equal(update(),0);assert.equal(claim(db),0);assert.equal(claim(db,{...reference,revision:2}),0);
 const next={...reference,revision:2};seedJob(db,'new-job',next);assert.equal(claim(db,next,'new-job'),1);
});
void test('cancellation and competing claims serialize on one job revision; results cannot replay a consumed claim',t=>{
 for(const order of ['cancel-first','claim-first']){const db=fixture(t);seedJob(db);
 const cancel=()=>Number(db.prepare("UPDATE work_jobs SET payload=json_set(payload,'$.status','cancelled'),revision=revision+1 WHERE id='job' AND revision=0").run().changes);
 if(order==='cancel-first'){assert.equal(cancel(),1);assert.equal(claim(db),0);}else{assert.equal(claim(db),1);assert.equal(cancel(),0);}
 assert.equal(claim(db),0);assert.equal(db.prepare('SELECT revision FROM work_jobs').get().revision,1);
 }
});
void test('reference parser rejects malformed fields and impossible revisions; SQL schema rejects invented root trust',t=>{
 const db=fixture(t);
 for(const patch of [{revision:0},{revision:-1},{revision:0.5},{revision:Number.MAX_SAFE_INTEGER+1},{revision:'1'},{ownerUserId:''},{ownerUserId:'bad\0owner'},{manifestSha256:'A'.repeat(64)},{packageKey:'arbitrary'},{authorityId:'x'.repeat(129)},{signature:'not-authority'}])assert.equal(workToolPackageAuthorityConsistency({...reference,...patch}),null);
 for(const value of [null,[],{},'grant'])assert.equal(workToolPackageAuthorityConsistency(value),null);
 assert.throws(()=>db.exec("UPDATE work_tool_package_authorities SET root_state='verified'"));
 assert.throws(()=>db.exec("UPDATE work_tool_package_authorities SET root_ref='production-root'"));
});
void test('contract fixture does not enable the normal account or eSIM production authority gate',()=>{
 const gate=loadRouteFixture(new URL('../app/api/work-jobs/tool-observations/authority.ts',import.meta.url),new Map([['cloudflare:workers',{env:{}}],['@/lib/request-auth',auth]])).dispatchAuthorityAvailable;
 for(const authorization of [null,'Bearer rock_session_'+'s'.repeat(43),'Bearer rock_esim_'+'e'.repeat(43)]){
  const request=new Request('https://fixture.invalid/api/work-jobs',{method:'POST',headers:{Origin:'https://fixture.invalid',...(authorization?{Authorization:authorization}:{})}});
  assert.equal(gate(request,'alice',true),false);assert.equal(gate(request,'alice',false),false);
 }
});

void test('another valid same-owner Package grant cannot be substituted into the original saved job',t=>{
 const db=fixture(t);seedJob(db);
 const other={...reference,authorityId:'another-grant',packageKey:'dev.other.tool@1.0.0',manifestSha256:'d'.repeat(64)};
 db.prepare('INSERT INTO work_tool_package_authorities SELECT ?,revision,owner_user_id,issuer_id,claim_id,offer_id,?,?,root_state,root_ref,state,issued_at,expires_at,revoked_at FROM work_tool_package_authorities WHERE authority_id=?').run(other.authorityId,other.packageKey,other.manifestSha256,reference.authorityId);
 assert.equal(claim(db,other),0);assert.equal(db.prepare('SELECT revision FROM work_jobs').get().revision,0);
 seedJob(db,'another-job',other);assert.equal(claim(db,other,'another-job'),1);
});

void test('fixture authority and exact job reference survive closing and reopening their SQLite file',t=>{
 const dir=mkdtempSync(join(tmpdir(),'rock-package-authority-fixture-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'fixture.sqlite'),db=fixture(t,file);seedJob(db);db.close();
 const reopened=new DatabaseSync(file);t.after(()=>reopened.close());
 assert.equal(reopened.prepare('SELECT root_state FROM work_tool_package_authorities').get().root_state,'fixture_only');
 assert.equal(claim(reopened),1);assert.equal(claim(reopened),0);
});

void test('a saved job cannot borrow a refreshed contract under the same authority id and revision',t=>{
 const db=fixture(t);seedJob(db);const now=Date.now();
 db.prepare('INSERT INTO rockstar_service_entitlements(issuer_id,claim_id,owner_user_id,offer_id,purchase_reference_sha256,claim_code_sha256,form_factor,scopes_json,issuer_key_id,claim_signature,status,claimed_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run('replacement-issuer','replacement-claim','alice','replacement-offer','e'.repeat(64),'f'.repeat(64),'service_only','["sky","zema"]','fixture-key','not-a-production-signature','active',now-1000,now+60000);
 db.prepare('UPDATE work_tool_package_authorities SET issuer_id=?,claim_id=?,offer_id=? WHERE authority_id=?').run('replacement-issuer','replacement-claim','replacement-offer',reference.authorityId);
 const refreshed={...reference,issuerId:'replacement-issuer',claimId:'replacement-claim',offerId:'replacement-offer'};
 assert.equal(claim(db,refreshed),0,'old job must remain bound to its original exact service contract');
 assert.equal(db.prepare('SELECT revision FROM work_jobs WHERE id=?').get('job').revision,0);
 seedJob(db,'fresh-job',refreshed);assert.equal(claim(db,refreshed,'fresh-job'),1);
});

void test('the SQL fragment itself correlates the row owner and complete saved reference without caller prechecks',t=>{
 const db=fixture(t);seedJob(db);const guard=workToolPackageAuthorityConsistency(reference);
 const update=()=>Number(db.prepare(`UPDATE work_jobs SET revision=revision+1 WHERE id='job' AND revision=0 AND ${guard.sql}`).run(...guard.bindings).changes);
 const patches=[{user_id:'bob'},...Object.keys(reference).map(key=>({referenceKey:key}))];
 for(const patch of patches){
  const original=db.prepare('SELECT user_id,payload FROM work_jobs WHERE id=?').get('job');
  if(patch.user_id)db.prepare('UPDATE work_jobs SET user_id=? WHERE id=?').run(patch.user_id,'job');
  else {const payload=JSON.parse(original.payload);payload.toolPackageAuthorityReference[patch.referenceKey]=patch.referenceKey==='revision'?2:'different';db.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(payload),'job');}
  assert.equal(update(),0,JSON.stringify(patch));
  db.prepare('UPDATE work_jobs SET user_id=?,payload=? WHERE id=?').run(original.user_id,original.payload,'job');
 }
 for(const value of [null,{}, {...reference,revision:'1'}, {...reference,authorityId:1}, {...reference,extra:true}]){
  const original=db.prepare('SELECT payload FROM work_jobs WHERE id=?').get('job').payload,payload=JSON.parse(original);
  payload.toolPackageAuthorityReference=value;db.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(payload),'job');assert.equal(update(),0);
  db.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(original,'job');
 }
 assert.equal(update(),1);
});
void test('legacy real WorkJobs without a fixture reference remain readable and cancellable but cannot claim fixture authority',t=>{
 const db=fixture(t);const legacy=createWorkJob({id:randomUUID(),title:'legacy fixture',templateId:'article'});
 const serialized=JSON.stringify(legacy);db.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(legacy.id,'alice',serialized,legacy.revision,legacy.updatedAt);
 const guard=workToolPackageAuthorityConsistency(reference);
 assert.equal(Number(db.prepare(`UPDATE work_jobs SET revision=revision+1 WHERE id=? AND ${guard.sql}`).run(legacy.id,...guard.bindings).changes),0);
 const stored=db.prepare('SELECT payload,revision FROM work_jobs WHERE id=?').get(legacy.id);assert.equal(stored.payload,serialized);assert.equal(stored.revision,legacy.revision);
 assert.equal(applyWorkCommand(JSON.parse(stored.payload),{id:randomUUID(),action:'cancel'},legacy.revision).status,'cancelled');
});
