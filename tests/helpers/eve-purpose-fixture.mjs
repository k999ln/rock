import {readFileSync} from 'node:fs';
import {runtimeFixture} from './eve-runtime-fixture.mjs';
import {loadRouteFixture} from './load-route-fixture.mjs';
import {requestUser} from '../../lib/request-auth.ts';
import {describeAdapter} from '../../lib/rockstar-adapters.ts';
import {createPurposeRuntimeEveWorkPort,purposeEvePendingKey} from '../../lib/eve-purpose-runtime-work-port.ts';
export async function purposeFixture(t){
 const f=runtimeFixture(t),presence=await f.announce({models:[{id:'test-model',name:'合成GGUF',scheme:'gguf-sha256',sha256:'cd'.repeat(32)}],host:describeAdapter('test-host','host','macos',{'identity.owner-local':true,'store.cas':true,'agent.prepare':true})});
 const url=new URL('../../app/api/eve/runtime/route.ts',import.meta.url),deps=new Map([['cloudflare:workers',{env:{EVE_HISTORY_KEYRING:JSON.stringify(f.keys)}}],['@/lib/fund-store',{database:()=>f.db,requestUser}]]);
 for(const match of readFileSync(url,'utf8').matchAll(/from ['"](@\/lib\/[^'"]+)['"]/g))if(!deps.has(match[1]))deps.set(match[1],await import(new URL('../../lib/'+match[1].slice(6)+'.ts',import.meta.url)));
 const route=loadRouteFixture(url,deps),library=new Map(),data=new Map(),calls=[];
 let hostAgents=[...presence.agents];
 let owner='alice',live=true,hostEnabled=true,loseLibrary=false,loseQueue=false;
 const counts={libraryWrites:0,preparationWrites:0,runtimeStarts:0};
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{data.set(k,v);},removeItem:k=>{data.delete(k);}};
 async function host(){
  if(!hostEnabled)return;const entries=await f.store().preparations.commands(f.device);
  if(!entries.length)return;const {command:c}=entries[0],id=c.request.id,claimId=id;
  await f.store().preparations.claim(f.device,{id,claimId,requestSha256:c.requestSha256});
  const grant=await f.store().preparations.authorize(f.device,id,claimId);if(grant.permission!=='agent.prepare'||grant.maximumCostMinor!==0)throw Error('invalid synthetic grant');
  if(!hostAgents.some(a=>a.id===c.request.agent.id))hostAgents.push(c.request.agent);
  await f.announce({...presence,agents:hostAgents});
  await f.store().preparations.acknowledge(f.device,{id,claimId,requestSha256:c.requestSha256,agent:c.request.agent,model:c.request.model});
 }
 async function api(path,init={}){
  calls.push({path,init});const method=init.method??'GET',headers=new Headers(init.headers);headers.set('origin','http://localhost');headers.set('oai-authenticated-user-id',owner);
  if(path.startsWith('/api/sky/agents')){
   if(headers.get('x-sky-owner')!==owner)throw Object.assign(Error('owner changed'),{status:409});
   if(method==='GET'){const id=new URL('http://localhost'+path).searchParams.get('id');if(id){if(!library.has(id))throw Object.assign(Error('missing'),{status:404});return {ownerUserId:owner,agent:structuredClone(library.get(id))};}return {ownerUserId:owner,agents:[...library.values()]};}
   const body=JSON.parse(init.body);if(library.has(body.id))throw Object.assign(Error('conflict'),{status:409});counts.libraryWrites++;
   library.set(body.id,{...body.settings,id:body.id,revision:1,updatedAt:Date.now(),source:'personal',sourceTool:null});
   if(loseLibrary){loseLibrary=false;throw Error('lost library response');}return {agent:structuredClone(library.get(body.id))};
  }
  if(path.includes('preparationId='))await host();
  const response=await route[method](new Request('http://localhost'+path,{...init,method,headers})),body=await response.json();
  if(!response.ok)throw Object.assign(Error(body.error),{status:response.status});
  if(method==='PUT'&&JSON.parse(init.body).action==='prepare-agent'){counts.preparationWrites++;if(loseQueue){loseQueue=false;throw Error('lost enqueue response');}}
  if(method==='POST')counts.runtimeStarts++;return body;
 }
 const binding={owner:'alice',threadId:crypto.randomUUID(),deviceId:f.device,modelId:'test-model',modelSha256:'cd'.repeat(32),modelScheme:'gguf-sha256'};
 const options={...binding,api,storage,continuing:()=>live,sleep:async()=>{}};
 return {...f,clearInitialAgents:async()=>{hostAgents=[];await f.announce({...presence,agents:[]});},binding,options,storage,data,library,calls,counts,pendingKey:purposeEvePendingKey(binding),port:()=>createPurposeRuntimeEveWorkPort(options),setOwner:v=>{owner=v;},retire:()=>{live=false;},disableHost:()=>{hostEnabled=false;},loseLibrary:()=>{loseLibrary=true;},loseQueue:()=>{loseQueue=true;}};
}
