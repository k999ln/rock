import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID } from 'node:crypto';
import { createNoahProfileStore, profileKeys, validateProfileFields } from '../lib/noah-profile-store.ts';
import { createNoahProfileApi } from '../lib/noah-profile-api.ts';
import { registrationProfileResolver } from '../lib/noah-registration-profile.ts';
import { createNoahRegistrationApi, parseRegistrationProviders } from '../lib/noah-registration.ts';
import { PROFILE_CONSENT_VERSION } from '../lib/noah-profile-contract.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
function fixture(){
  const objects=new Map();let etag=0;
  const bucket={async get(key){const item=objects.get(key);return item?{size:item.text.length,etag:item.etag,text:async()=>item.text}:null;},async put(key,text,options){const old=objects.get(key);if(options?.onlyIf?.etagMatches&&old?.etag!==options.onlyIf.etagMatches)return null;if(options?.onlyIf?.etagDoesNotMatch==='*'&&old)return null;const item={text,etag:String(++etag)};objects.set(key,item);return item;},async delete(key){objects.delete(key);}};
  const keys={active:'v1',keys:{v1:randomBytes(32).toString('hex')}};
  const store=createNoahProfileStore(bucket,keys);
  const authenticate=async r=>{const user=r.headers.get('X-Test-User');if(!user)throw Error('UNAUTHORIZED');return user;};
  const api=createNoahProfileApi({store,authenticate});
  const request=async(body,user='alice',headers={})=>new Request('https://noah.test/api/noah/profile',{method:body?'POST':'GET',headers:{'X-Test-User':user,Origin:'https://noah.test','Content-Type':'application/json','X-Rock-Owner-Scope':await ownerScopeFor(user),...headers},...(body?{body:JSON.stringify(body)}:{})});
  return {objects,bucket,keys,store,api,request,authenticate};
}
const grant={target:'agent-one',name:'Agent',action:'read',label:'読む',digest:'a'.repeat(64),mode:'allow'};
const consent=(version=PROFILE_CONSENT_VERSION,fields=['email'])=>({version,at:Date.now(),action:'save',fields,documents:[]});
void test('owner vault is encrypted, authenticated, bounded and concurrent changes fail closed',async()=>{
  const f=fixture();const saved=await f.api.collection(await f.request({action:'fields',revision:0,consentVersion:PROFILE_CONSENT_VERSION,reuse:true,fields:{name:'Synthetic Alice',email:'alice@example.test',bankNumber:'0000123'}}));assert.equal(saved.status,200);
  const body=await saved.json();assert.equal(body.revision,1);assert.equal(body.fields.name,'Synthetic Alice');
  const raw=[...f.objects.values()].map(v=>v.text).join('');assert.doesNotMatch(raw,/Synthetic|alice@example|0000123/);
  assert.equal((await f.store.load('bob')).profile.revision,0);
  assert.equal((await f.api.collection(await f.request({action:'fields',revision:1,fields:{}},'bob',{'X-Rock-Owner-Scope':await ownerScopeFor('alice')}))).status,409);
  assert.equal((await f.api.collection(await f.request({action:'fields',revision:1,fields:{}},'alice',{Origin:'https://attacker.test'}))).status,403);
  assert.equal((await f.api.collection(new Request('https://noah.test/api/noah/profile'))).status,401);
  const writes=await Promise.allSettled([f.store.change('alice',1,p=>({...p,paused:true})),f.store.change('alice',1,p=>({...p,paused:false}))]);assert.equal(writes.filter(v=>v.status==='fulfilled').length,1);
  assert.equal((await f.api.collection(await f.request({action:'fields',revision:1,fields:{}}))).status,409);
  assert.throws(()=>validateProfileFields({password:'secret'}));assert.throws(()=>validateProfileFields({birthDate:'2026-99-31'}));assert.throws(()=>validateProfileFields({birthDate:'2026-02-30'}));
});
void test('copied ciphertext, tampering and missing keys cannot expose data or bypass denials',async()=>{
  const f=fixture();await f.store.change('alice',0,p=>({...p,reuseEnabled:true,fields:{name:'Private Alice'}}));const [path,value]=[...f.objects][0];
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('bob'));const hex=Buffer.from(hash).toString('hex');f.objects.set(`noah-private/v1/${hex}/profile`,value);await assert.rejects(()=>f.store.load('bob'));
  f.objects.set(path,{...value,text:value.text.replace(/ciphertext":"./,'ciphertext":"!')});await assert.rejects(()=>f.store.load('alice'));
  await assert.rejects(()=>createNoahProfileStore(f.bucket,null).authorize('alice','agent','read','a'.repeat(64),true));
  assert.equal(profileKeys('{}'),null);assert.equal(profileKeys(JSON.stringify(f.keys)).active,'v1');
});
void test('documents require owner, verify content, encrypt at rest, and delete by revision',async()=>{
  const f=fixture(),bytes=new TextEncoder().encode('%PDF-1.7\nSynthetic identity fixture');
  const p=await f.store.addDocument('alice',0,'identity.pdf','application/pdf',bytes);const doc=p.documents[0];
  assert.deepEqual((await f.store.document('alice',doc.id)).bytes,bytes);await assert.rejects(()=>f.store.document('bob',doc.id),{status:404});
  assert.doesNotMatch([...f.objects.values()].map(v=>v.text).join(''),/Synthetic identity|identity.pdf/);
  const response=await f.api.document(await f.request(),doc.id);assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/^attachment/);assert.equal(response.headers.get('cache-control'),'private, no-store');
  await assert.rejects(()=>f.store.addDocument('alice',1,'bad.png','image/png',bytes));
  await assert.rejects(()=>f.store.addDocument('alice',1,'huge.pdf','application/pdf',new Uint8Array(6*1024*1024)));
  await f.store.removeDocument('alice',1,doc.id);await assert.rejects(()=>f.store.document('alice',doc.id),{status:404});assert.equal(f.objects.size,1);
});
void test('allow, per-run confirmation, deny, changed definition and global pause enforce independently',async()=>{
  const f=fixture();await f.store.change('alice',0,p=>({...p,grants:[{...grant,mode:'confirm'}]}));
  await assert.rejects(()=>f.store.authorize('alice',grant.target,grant.action,grant.digest,false),{status:409});await f.store.authorize('alice',grant.target,grant.action,grant.digest,true);
  await f.store.change('alice',1,p=>({...p,grants:[grant]}));await f.store.authorize('alice',grant.target,grant.action,grant.digest,false);
  await assert.rejects(()=>f.store.authorize('alice',grant.target,grant.action,'b'.repeat(64),false),{status:409});
  await f.store.change('alice',2,p=>({...p,grants:[{...grant,mode:'deny'}]}));await assert.rejects(()=>f.store.authorize('alice',grant.target,grant.action,grant.digest,true),{status:403});
  await f.store.change('alice',3,p=>({...p,paused:true}));await assert.rejects(()=>f.store.authorize('alice','other','read',grant.digest,true),{status:403});await f.store.authorize('bob','other','read',grant.digest,false);
});
const providers=()=>parseRegistrationProviders(JSON.stringify(['one','two'].map(id=>({id,name:id,agentIds:[id],revision:1,providerOrigin:`https://${id}.example.com`,verificationUrl:`https://${id}.example.com/verify`,termsUrl:`https://${id}.example.com/terms`,termsVersion:'v1',executorName:'Agent',executorUrl:'https://registration.example.com/run',fields:[{key:'contact',label:'メール',type:'email',profileField:'email',required:true,maxLength:320},{key:'identity',label:'書類',type:'file',profileField:'identityDocument',required:false,maxLength:160}]}))));
void test('two providers receive only explicitly mapped selected saved fields; revocation blocks deferred dispatch',async()=>{
  const f=fixture();await f.store.change('alice',0,p=>({...p,reuseEnabled:true,fields:{email:'synthetic@example.test',bankNumber:'private-number',name:'Private Name'},consents:[consent(PROFILE_CONSENT_VERSION,['email','bankNumber','name'])]}));
  const resolve=registrationProfileResolver(f.store,f.authenticate),request=await f.request({});
  for(const provider of providers()){const resolved=await resolve(request,provider,{revision:1,fields:['contact']});assert.deepEqual(resolved.values,{contact:'synthetic@example.test'});assert.deepEqual(resolved.documents,{});await resolved.beforeSend();}
  await assert.rejects(()=>resolve(request,providers()[0],{revision:1,fields:['password']}));
  await assert.rejects(async()=>resolve(await f.request({},'bob'),providers()[0],{revision:1,fields:['contact']}));
  const resolved=await resolve(request,providers()[0],{revision:1,fields:['contact']});await f.store.change('alice',1,p=>({...p,paused:true}));await assert.rejects(()=>resolved.beforeSend(),{status:403});
});
void test('a profile with only an older consent receipt cannot be reused for the expanded explanation',async()=>{
  const f=fixture();await f.store.change('alice',0,p=>({...p,reuseEnabled:true,fields:{email:'old-consent@example.test'},consents:[consent('2026-11-22.1')]}));
  const resolve=registrationProfileResolver(f.store,f.authenticate),request=await f.request({});
  await assert.rejects(()=>resolve(request,providers()[0],{revision:1,fields:['contact']}),{status:409});
});
void test('selected document reaches resolver in memory, never as a public URL; stale profile is rejected',async()=>{
  const f=fixture();const p=await f.store.addDocument('alice',0,'identity.pdf','application/pdf',new TextEncoder().encode('%PDF-1.7\nsynthetic'),PROFILE_CONSENT_VERSION);
  const resolve=registrationProfileResolver(f.store,f.authenticate),provider=providers()[0],request=await f.request({});
  const resolved=await resolve(request,provider,{revision:1,fields:['identity'],documentId:p.documents[0].id});assert.equal(resolved.documents.identity.type,'application/pdf');assert.match(Buffer.from(resolved.documents.identity.base64,'base64').toString(),/^%PDF/);assert.equal(resolved.values.identity,'identity.pdf');
  await f.store.change('alice',1,p=>({...p,fields:{name:'changed'}}));await assert.rejects(()=>resolved.beforeSend(),{status:409});
});

void test('registration HTTP dispatch reuses an encrypted profile across two providers without copying it into Work',async t=>{
 const f=fixture(),sql=new DatabaseSync(':memory:');t.after(()=>sql.close());sql.exec('CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)');
 const db={prepare(query){const s={args:[],bind(...args){return {...s,args};},async first(){return sql.prepare(query).get(...this.args)??null;},async run(){return {meta:{changes:Number(sql.prepare(query).run(...this.args).changes)}};}};return s;}};
 await f.store.change('alice',0,p=>({...p,reuseEnabled:true,fields:{email:'reusable@example.test',bankNumber:'private-bank'},consents:[consent(PROFILE_CONSENT_VERSION,['email','bankNumber'])]}));
 const sent=[],api=createNoahRegistrationApi({db,providers:providers(),token:'synthetic-token-'.repeat(4),resolveProfile:registrationProfileResolver(f.store,f.authenticate),fetcher:async(url,init)=>{const body=JSON.parse(init.body);sent.push(body);return Response.json({id:body.id,state:'needs_user'});}});
 for(const provider of providers()){
  const response=await api(new Request('https://noah.test/api/noah/registration',{method:'POST',headers:{Origin:'https://noah.test','Content-Type':'application/json','X-Test-User':'alice','X-Rock-Owner-Scope':await ownerScopeFor('alice'),'X-Noah-Registration-Key':randomBytes(32).toString('hex')},body:JSON.stringify({action:'start',id:randomUUID(),providerId:provider.id,agentId:provider.id,revision:1,termsVersion:'v1',values:{},profile:{revision:1,fields:['contact']},consent:true,termsAccepted:true})}));
  assert.equal(response.status,202);assert.equal((await response.json()).job.state,'needs_user');
 }
 assert.equal(sent.length,2);assert.deepEqual(sent.map(v=>v.values),[{contact:'reusable@example.test',identity:''},{contact:'reusable@example.test',identity:''}]);
 assert.doesNotMatch(JSON.stringify(sql.prepare('SELECT * FROM work_jobs').all()),/reusable@example|private-bank/);
});

void test('save consent is atomic, versioned and required; reuse stop works even at the receipt limit',async()=>{
 const f=fixture();
 const missing=await f.api.collection(await f.request({action:'fields',revision:0,fields:{email:'a@example.test'},reuse:true}));assert.equal(missing.status,409);assert.equal((await f.store.load('alice')).profile.revision,0);
 const saved=await f.api.collection(await f.request({action:'fields',revision:0,fields:{email:'a@example.test'},reuse:true,consentVersion:PROFILE_CONSENT_VERSION}));const p=await saved.json();assert.equal(saved.status,200);assert.equal(p.consents.length,1);assert.deepEqual(p.consents[0].fields,['email']);assert.equal(p.consents[0].version,PROFILE_CONSENT_VERSION);assert.ok(p.consents[0].at>0);
 const resolve=registrationProfileResolver(f.store,f.authenticate),r=await f.request({});const pending=await resolve(r,providers()[0],{revision:1,fields:['contact']});
 await f.store.change('alice',1,p=>({...p,consents:Array.from({length:128},()=>p.consents[0])}));
 const stopped=await f.api.collection(await f.request({action:'reuse',revision:2,enabled:false,consentVersion:PROFILE_CONSENT_VERSION}));assert.equal(stopped.status,200);const end=await stopped.json();assert.equal(end.reuseEnabled,false);assert.equal(end.consents.length,129);assert.equal(end.fields.email,'a@example.test');
 await assert.rejects(()=>resolve(r,providers()[0],{revision:end.revision,fields:['contact']}),{status:403});await assert.rejects(()=>pending.beforeSend(),{status:409});
});

void test('profile screen persists through the API, records consent and keeps file selection mounted',async()=>{
 const {screen}=await import('./fixtures/noah/screen.mjs');
 const ownerIntent=await import('../lib/owner-intent.ts');
 const f=fixture(),listeners=new Set(),document={hidden:false,addEventListener(_name,fn){listeners.add(fn);},removeEventListener(_name,fn){listeners.delete(fn);}};
 const ui=screen({document,modules:{'@/lib/owner-intent':ownerIntent},fetch:async r=>{
  if(r.url==='/api/noah/profile'){const response=await f.api.collection(await f.request(r.body));return {status:response.status,body:await response.json()};}
  if(r.url.startsWith('/api/noah/intake'))return {body:{items:[]}};
  if(r.url.startsWith('/api/noah/registration'))return {body:{providers:[]}};
  throw Error('Unexpected request');
 }});
 const page=ui.mount('components/noah-profile.tsx');await page.flush();
 assert.doesNotMatch(page.text(),/再利用は停止中|再利用を再開/);
 const name=page.find('label').find(n=>page.text(n)==='氏名');await page.change(page.nodes(name).find(n=>n.type==='input'),'Synthetic profile');
 await page.submit(page.find('form')[0]);assert.match(page.text(),/保存済み/);const persisted=(await f.store.load('alice')).profile;assert.equal(persisted.fields.name,'Synthetic profile');assert.equal(persisted.consents.length,1);
 const picker=page.find('input').find(n=>n.props.type==='file');await page.press(picker);document.hidden=true;listeners.forEach(fn=>fn());await page.flush();assert.equal(page.find('input').filter(n=>n.props.type==='file').length,1,'file chooser must not unmount during background transition');
 document.hidden=false;listeners.forEach(fn=>fn());await page.flush();assert.match(page.text(),/Synthetic profile|保存済み/);
 await page.click('再利用を停止');assert.equal((await f.store.load('alice')).profile.reuseEnabled,false);
});

void test('a maximum-size identity file survives the encrypted round trip',async()=>{const f=fixture(),bytes=new Uint8Array(5*1024*1024);bytes.set(new TextEncoder().encode('%PDF-1.7\n'));bytes[bytes.length-1]=255;const p=await f.store.addDocument('alice',0,'synthetic.pdf','application/pdf',bytes,PROFILE_CONSENT_VERSION);assert.deepEqual((await f.store.document('alice',p.documents[0].id)).bytes,bytes);});
