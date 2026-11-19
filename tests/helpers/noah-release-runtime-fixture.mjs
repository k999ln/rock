import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { noahTerminalTemplate } from '../../lib/noah-terminal-template.ts';
import { terminalTextSchema } from '../../lib/noah-terminal-contract.mjs';
import { createNoahAgentApi } from '../../lib/noah-agent-api.ts';
import { noahAgentStore } from '../../lib/noah-agent-store.ts';
import { noahSha256 } from '../../lib/noah-agent-upload.ts';
import { createNoahPublisherApi } from '../../lib/noah-publisher.ts';
import { createNoahReleaseApi } from '../../lib/noah-release.ts';
import { createSkyToolPackageDraft } from '../../lib/sky-tool-package.ts';
import { parseSkyToolReview, skyToolReviewStore, SKY_REVIEW_CHECKS } from '../../lib/sky-tool-review.ts';
import { ownerScopeFor } from '../../lib/owner-intent.ts';
import { workStore } from '../../lib/work-store.ts';
import { createNoahWork, updateNoahWork } from '../../lib/noah-execution.ts';
import { validateNoahExecutionSource } from '../../lib/noah-execution-source.ts';
import { releaseSourceLoader } from '../../scripts/noah-release-loader.mjs';
import { InstallError } from '../../scripts/noah-source-fetch.mjs';

// Synthetic local commerce only. This helper is never imported by product routes
// and never claims a provider payment, independent review, or public publication.
export async function releaseRuntimeFixture({ language = 'node', pricing = 'external_contract', sourceTemplate, registerThroughApi = false } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0021_sites_schema_convergence.sql','0033_noah_agent_uploads.sql','0034_noah_upload_refactor.sql','0037_noah_agent_invites.sql','0039_noah_invite_execution.sql']) sqlite.exec(readFileSync(new URL('../../drizzle/'+name,import.meta.url),'utf8'));
  const statement=(sql,args=[])=>({bind:(...values)=>statement(sql,values),async first(){return sqlite.prepare(sql).get(...args)||null;},async all(){const results=sqlite.prepare(sql).all(...args);return {results,meta:{changes:sqlite.prepare('SELECT changes() AS n').get().n}};},async run(){const v=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(v.changes)}};}});
  const db={prepare:statement,async batch(items){sqlite.exec('BEGIN');try{const values=[];for(const item of items)values.push(await item.all());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
  const blobs=new Map();let onRead;
  const bucket={async put(key,bytes){blobs.set(key,new Uint8Array(bytes));},async get(key){const bytes=blobs.get(key);await onRead?.(key);return bytes?{body:new Response(bytes).body}:null;}};
  const authenticate=async r=>{const user=r.headers.get('test-owner');if(!user)throw new Error('UNAUTHORIZED');return user;};
  const deps={db,bucket,authenticate,mode:'test'},release=createNoahReleaseApi(deps),publisher=createNoahPublisherApi(deps);
  const template=sourceTemplate??noahTerminalTemplate(language),id=randomUUID();let hash=await noahSha256(template.bytes),manifestHash=await noahSha256(new TextEncoder().encode(JSON.stringify(template.manifest)));
  const uploads=noahAgentStore(db,'author-fixture'),source={key:'own-source',name:template.name,bytes:template.bytes.length,sha256:hash};
  if(registerThroughApi){
    const form=new FormData();form.set('id',id);form.set('manifest',JSON.stringify(template.manifest));form.set('rightsConfirmed','true');form.set('source',new File([template.bytes],template.name));
    const response=await createNoahAgentApi(deps).create(new Request('http://127.0.0.1:3999/api/noah/agents',{method:'POST',headers:{Origin:'http://127.0.0.1:3999','test-owner':'author-fixture','X-Rock-Owner-Scope':await ownerScopeFor('author-fixture')},body:form}));const data=await response.json();if(response.status!==201)throw new Error(JSON.stringify(data));hash=data.agent.source.sha256;manifestHash=data.agent.manifestSha256;Object.assign(source,data.agent.source,{key:await uploads.sourceKey(id)});
  } else {
  await uploads.reserve({id,manifest:template.manifest,manifestSha256:manifestHash,source});await bucket.put(source.key,template.bytes);
  await uploads.complete(id,source,{engine:'noah-source-refactor/1',status:'unchanged',validation:'not_run',message:'synthetic fixture',changes:[]});
  }
  const pkg=createSkyToolPackageDraft({sourceKind:'inline_code',fileName:source.name,name:'Terminal release fixture',summary:'Synthetic immutable headless release for local acceptance only.',developerName:'Fixture Author',developerId:'fixture',license:'MIT',version:'1.0.0'});
  pkg.adapter={connectionType:'rock_recipe',endpointUrl:null};pkg.capabilities={connectivity:'offline',executionTargets:['device_local'],permissions:['read_user_input','write_results'],sideEffects:['local_write']};
  pkg.execution={timeoutSeconds:240,maxAttempts:1,idempotency:'required',confirmation:'per_run'};pkg.pricing.model=pricing;
  pkg.io={inputSchema:terminalTextSchema('prompt'),outputSchema:terminalTextSchema('text')};
  const req=(url,owner='buyer-fixture')=>new Request('http://127.0.0.1:3999'+url,{headers:{'test-owner':owner}});
  const saved=await publisher.create(new Request('http://127.0.0.1:3999/api/noah/publisher',{method:'POST',headers:{Origin:'http://127.0.0.1:3999','Content-Type':'application/json','test-owner':'author-fixture','X-Rock-Owner-Scope':await ownerScopeFor('author-fixture')},body:JSON.stringify({manifest:pkg,upload:{id,manifestSha256:manifestHash,sourceSha256:hash},confirmations:{rights:true,pricing:true,sideEffects:true,tests:true,distributeSource:true}})}));
  const data=await saved.json();if(saved.status!==201)throw new Error(JSON.stringify(data));const p=data.package;
  const describe=(owner='buyer-fixture')=>release.describe(req('/api/noah/releases?manifest='+p.manifestSha256,owner));
  const review=()=>skyToolReviewStore(db).review('synthetic-independent-reviewer',parseSkyToolReview({packageKey:p.packageKey,manifestSha256:p.manifestSha256,decision:'verified',sourceRevision:hash,sourceSha256:hash,checks:Object.fromEntries(SKY_REVIEW_CHECKS.map(k=>[k,true])),evidenceUrls:['https://example.com/synthetic-local-fixture'],notes:'Synthetic local fixture, not market approval.',expiresAt:Date.now()+86400001}));
  const orderId=randomUUID();
  const purchase=(status='paid')=>sqlite.prepare(`INSERT INTO sky_commerce_orders(id,buyer_user_id,seller_user_id,mode,package_key,manifest_sha256,name,amount_minor,commission_minor,currency,account_id,offer_revision,terms_url,refund_policy,status,active_key,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(orderId,'buyer-fixture','author-fixture','test',p.packageKey,p.manifestSha256,'Synthetic purchase',100,0,'jpy','synthetic-account',1,'https://example.com/terms','Synthetic, no payment',status,JSON.stringify(['test','buyer-fixture',p.packageKey]),Date.now(),Date.now());
  const setPayment=status=>sqlite.prepare('UPDATE sky_commerce_orders SET status=? WHERE id=?').run(status,orderId);
  const loader=async(owner='buyer-fixture')=>{
    const scope=await ownerScopeFor(owner);
    return releaseSourceLoader({headers:{host:'127.0.0.1:3999'}},scope,'release-'+p.manifestSha256,async()=>({ownerScope:scope,localHostOwner:true}),async address=>{
      const url=new URL(address);
      return url.pathname==='/api/noah/releases'?release.describe(req(url.pathname+url.search,owner)):release.download(req(url.pathname+url.search,owner),decodeURIComponent(url.pathname.split('/')[4]));
    });
  };
  const jobs=workStore(db);
  const work=(owner='buyer-fixture')=>async(action,input)=>{
    if(action==='get'){const job=await jobs.get(owner,input.id);if(!job)throw new InstallError('missing',404);return {job};}
    if(action==='create'){const candidate=await createNoahWork(input.id,input.binding);await validateNoahExecutionSource(deps,owner,candidate.noahExecution);return {job:await jobs.create(owner,candidate)};}
    const current=await jobs.get(owner,input.id);if(!current)throw new InstallError('missing',404);
    if(action==='start')await validateNoahExecutionSource(deps,owner,current.noahExecution);
    const next=await updateNoahWork(current,{...input,action});if(!await jobs.update(owner,next,current.revision))throw new InstallError('conflict',409);return {job:next};
  };
  return {sqlite,db,deps,bucket,blobs,uploads,id,hash,p,template,describe,review,purchase,setPayment,loader,work,jobs,
    onRead:fn=>{onRead=fn;},revoke:()=>sqlite.prepare("UPDATE sky_tool_packages SET status='revoked' WHERE package_key=?").run(p.packageKey),close:()=>sqlite.close()};
}
