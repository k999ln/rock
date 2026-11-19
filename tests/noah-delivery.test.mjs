import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { deliveryTargets,deliveryDestination,deliveryDigest,parseDeliveryPayload,contactDeliveryTarget } from '../lib/noah-delivery.ts';
import { createNoahDeliveryReceiver } from '../services/noah-delivery-receiver/server.mjs';
const payload={recipient:'test-inbox',agent:{name:'Test Agent',version:'1.0.0',summary:'Synthetic only'},body:'No private data'};
const target={id:'inbox',label:'Test',endpoint:'https://inbox.example.test',revision:'1',pricing:'free',test:false,token:'server-only-credential'};
void test('server target configuration is owner scoped, secret free in projection and rejects unknown billing, URLs and duplicate IDs',()=>{
 const config={id:'inbox',label:'Test',endpoint:target.endpoint,revision:'1',pricing:'free',credentialEnv:'NOAH_TEST_KEY',owners:['alice']};const env={NOAH_DELIVERY_TARGETS:JSON.stringify([config]),NOAH_TEST_KEY:target.token};
 assert.equal(deliveryTargets(env,'alice','https://noah.example.test').length,1);assert.equal(deliveryTargets(env,'bob','https://noah.example.test').length,0);assert.equal('token' in deliveryDestination(target),false);
 for(const endpoint of ['http://external.test','https://name:pass@external.test','https://127.0.0.1','https://[::1]','https://external.test?key=secret','https://external.test#fragment'])assert.throws(()=>deliveryTargets({...env,NOAH_DELIVERY_TARGETS:JSON.stringify([{...config,endpoint}])},'alice','https://noah.example.test'));
 for(const pricing of ['usage','unknown'])assert.equal(deliveryTargets({...env,NOAH_DELIVERY_TARGETS:JSON.stringify([{...config,pricing}])},'alice','https://noah.example.test').length,0);
 assert.throws(()=>deliveryTargets({...env,NOAH_DELIVERY_TARGETS:JSON.stringify([config,config])},'alice','https://noah.example.test'));
 const local={ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'local-preview:rockstar-owner'};assert.equal(deliveryTargets(local,local.ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID,'http://127.0.0.1:3107').length,1);assert.equal(deliveryTargets(local,local.ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID,'https://noah.example.test').length,0);
});
void test('wire payload forbids auto-added originals, source URLs, tokens, control recipients and excessive UTF-8 size',()=>{
 assert.deepEqual(parseDeliveryPayload(payload),payload);
 for(const patch of [{source:'code'},{token:'invite-token'},{recipient:'foo\nbar'},{agent:{...payload.agent,sourceUrl:'https://private.test'}},{body:'x'.repeat(4001)},{agent:{name:'あ'.repeat(2000),version:'1',summary:'あ'.repeat(2000),author:'あ'.repeat(2000),license:'あ'.repeat(2000)}}])assert.throws(()=>parseDeliveryPayload({...payload,...patch}));
});
void test('transport never follows redirects/retries and accepts only bounded exact identity receipts',async()=>{
 const attempt={id:randomUUID(),payloadSha256:await deliveryDigest(payload)},calls=[];
 const valid={schema:'noah-delivery-receipt/1',...attempt,status:'accepted',receiptId:'r1',receivedAt:Date.now()};
 assert.equal((await contactDeliveryTarget(target,attempt,payload,async(url,init)=>{calls.push({url,init});return Response.json(valid);})).status,'accepted');assert.equal(calls.length,1);assert.equal(calls[0].init.redirect,'manual');assert.equal(calls[0].init.headers['Idempotency-Key'],attempt.id);
 for(const response of [Response.json({...valid,id:randomUUID()}),Response.json({...valid,payloadSha256:'b'.repeat(64)}),Response.json({...valid,status:'not_found'}),Response.json({...valid,extra:'not authorized'}),new Response('x'.repeat(8200)),new Response(null,{status:302,headers:{Location:'https://other.test'}})])assert.equal(await contactDeliveryTarget(target,attempt,payload,async()=>response),null);
 assert.equal(await contactDeliveryTarget(target,attempt,payload,async()=>{throw Error('network');}),null);
});
void test('real HTTP receiver keeps one durable acceptance per ID and survives response loss and restart',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'noah-delivery-')),path=join(directory,'inbox.sqlite');let server;
 t.after(async()=>{if(server?.listening){const closed=once(server,'close');server.close();server.closeAllConnections();await closed;}rmSync(directory,{recursive:true,force:true});});
 const start=async()=>{server=createNoahDeliveryReceiver({path,token:target.token,testMode:true});server.listen(0,'127.0.0.1');await once(server,'listening');return {...target,endpoint:`http://127.0.0.1:${server.address().port}`};};
 let actual=await start();const lost={...payload,recipient:'test-lost-response'},attempt={id:randomUUID(),payloadSha256:await deliveryDigest(lost)};
 assert.equal(await contactDeliveryTarget(actual,attempt,lost),null);
 const read=await contactDeliveryTarget(actual,attempt,null);assert.equal(read.status,'accepted');
 assert.equal(await contactDeliveryTarget(actual,attempt,lost),null);
 const different={...lost,body:'changed'},changed={...attempt,payloadSha256:await deliveryDigest(different)};assert.equal(await contactDeliveryTarget(actual,changed,different),null);
 const c=once(server,'close');server.close();server.closeAllConnections();await c;actual=await start();assert.deepEqual(await contactDeliveryTarget(actual,attempt,null),read);
 const reject={...payload,recipient:'test-reject'},rejected={id:randomUUID(),payloadSha256:await deliveryDigest(reject)};assert.equal((await contactDeliveryTarget(actual,rejected,reject)).status,'rejected');
 const unauthorized={...actual,token:'wrong-credential-value'};assert.equal(await contactDeliveryTarget(unauthorized,attempt,null),null);
 const sql=new DatabaseSync(path);assert.equal(sql.prepare('select count(*) as n from deliveries where id=?').get(attempt.id).n,1);sql.close();
});
void test('real Workers fetch reaches the durable receiver and refuses redirects without forwarding the payload', {timeout:30000}, async t=>{
 const {build}=await import('esbuild'),{Miniflare,convertV4MiniflareOptions}=await import('miniflare'),{createServer}=await import('node:http');
 const directory=mkdtempSync(join(tmpdir(),'noah-delivery-worker-')),path=join(directory,'inbox.sqlite');
 const server=createNoahDeliveryReceiver({path,token:target.token});server.listen(0,'127.0.0.1');await once(server,'listening');const endpoint=`http://127.0.0.1:${server.address().port}`;
 const redirect=createServer((_req,res)=>{res.writeHead(307,{Location:endpoint+'/deliveries/'+randomUUID()});res.end();});redirect.listen(0,'127.0.0.1');await once(redirect,'listening');
 let mf;t.after(async()=>{await mf?.dispose();for(const s of [redirect,server]){const closed=once(s,'close');s.close();s.closeAllConnections();await closed;}rmSync(directory,{recursive:true,force:true});});
 const {outputFiles}=await build({stdin:{contents:"import {contactDeliveryTarget,deliveryDigest} from './lib/noah-delivery.ts';export default {async fetch(request,env){const p=await request.json();const id=crypto.randomUUID();const receipt=await contactDeliveryTarget({endpoint:env.ENDPOINT,token:env.TOKEN},{id,payloadSha256:await deliveryDigest(p)},p);return Response.json({receipt});}};",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
 const options={modules:true,script:outputFiles[0].text,compatibilityDate:'2026-10-01',bindings:{ENDPOINT:endpoint,TOKEN:target.token}};
 mf=new Miniflare(convertV4MiniflareOptions(options));const request=()=>mf.dispatchFetch('https://noah.test/send',{method:'POST',body:JSON.stringify(payload)});
 assert.equal((await (await request()).json()).receipt.status,'accepted');await mf.dispose();mf=new Miniflare(convertV4MiniflareOptions({...options,bindings:{...options.bindings,ENDPOINT:`http://127.0.0.1:${redirect.address().port}`}}));
 assert.equal((await (await request()).json()).receipt,null);const sql=new DatabaseSync(path);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n,1);sql.close();
});
