import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {readFileSync,readdirSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const args=process.argv.slice(2),projectIndex=args.indexOf('--project');assert.ok(projectIndex>=0&&args[projectIndex+1],'--project required');
const root=resolve(args[projectIndex+1]),load=p=>import(pathToFileURL(join(root,p))),clean=[];
const {authorAgreementSourceFixture}=await load('tests/helpers/eve-author-source-fixture.mjs');
const {sourceSandboxRestoreStatements}=await load('scripts/sky-monthly-sandbox-db.mjs');
const {copyWorkerBuildFixture}=await import('./worker-build-fixture.mjs');
const {ownerScopeFor,OWNER_SCOPE_HEADER}=await load('lib/owner-intent.ts');
const f=await authorAgreementSourceFixture({after:g=>clean.push(g)},false,true,50,'USD',{mode:'platform_invoice',chargeScope:'author_fee',usageFunding:'byok',refundPolicy:'itemized_source/1'});
const state=mkdtempSync(join(tmpdir(),'eve-author-worker-')),build=join(state,'dist');copyWorkerBuildFixture(join(root,'dist'),build);
const directory=join(build,'server'),config=JSON.parse(readFileSync(join(directory,'wrangler.json'),'utf8'));
let externalCalls=0,providerReadCalls=0,providerRefundPending=false,providerDisputed=false,providerFailure=false;
const paymentEvidenceMode=process.argv.includes('--payment-evidence');let providerInvoiceId=null;
function mockProvider(request){
 const u=new URL(request.url);
 if(!paymentEvidenceMode||u.hostname!=='api.stripe.com'||request.method!=='GET'){externalCalls++;return new Response('Fixture forbids external calls',{status:503});}
 providerReadCalls++;if(providerFailure)return new Response('Synthetic provider unavailable',{status:503});
 if(u.pathname==='/v1/account')return Response.json({id:'acct_fixture'});
 if(u.pathname==='/v1/invoices/in_fixture')return Response.json({id:'in_fixture',customer:'cus_fixture',livemode:false,metadata:{sky_monthly:providerInvoiceId},currency:'usd',total:50,status:'paid',amount_paid:50,amount_remaining:0,payments:{has_more:false,data:[{invoice:'in_fixture',status:'paid',amount_paid:50,payment:{type:'payment_intent',payment_intent:'pi_fixture'}}]}});
 if(u.pathname==='/v1/payment_intents/pi_fixture')return Response.json({id:'pi_fixture',customer:'cus_fixture',livemode:false,currency:'usd',status:'succeeded',amount_received:50,latest_charge:{id:'ch_fixture',customer:'cus_fixture',payment_intent:'pi_fixture',livemode:false,currency:'usd',paid:true,captured:true,amount:50,amount_captured:50,refunded:false,amount_refunded:0,disputed:providerDisputed}});
 if(u.pathname==='/v1/refunds'&&u.searchParams.get('charge')==='ch_fixture'&&u.searchParams.get('limit')==='100')return Response.json({has_more:false,data:providerRefundPending?[{id:'re_fixture',charge:'ch_fixture',payment_intent:'pi_fixture',currency:'usd',amount:10,status:'pending'}]:[]});
 externalCalls++;return new Response('Unexpected provider read',{status:503});
}
const runtime=()=>new Miniflare(convertV4MiniflareOptions({resourcePersistencePath:join(state,'db'),workers:[{name:config.name,rootPath:directory,modules:[config.main,...readdirSync(directory,{recursive:true,encoding:'utf8'}).filter(p=>p!==config.main&&!p.split('/').some(v=>v.startsWith('._'))&&/\.m?js$/.test(p))].map(p=>({type:'ESModule',path:resolve(directory,p)})),compatibilityDate:config.compatibility_date,compatibilityFlags:config.compatibility_flags,bindings:{...config.vars,ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID:'alice',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'false',SKY_CLOUD_MONTHLY_MODE:'stripe-test',SKY_MONTHLY_STRIPE_KEY:'sk_test_fixture',SKY_MONTHLY_STRIPE_ACCOUNT:'acct_fixture',SKY_MONTHLY_STRIPE_WEBHOOK_SECRET:'whsec_fixture',EVE_HISTORY_KEYRING:JSON.stringify(f.historyKeys),SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS:f.config()},d1Databases:{DB:'author-fixture'},r2Buckets:['BUCKET'],outboundService:mockProvider}]}));
let mf=runtime();
try{
 await mf.ready;let db=await mf.getD1Database('DB',config.name);for(const sql of sourceSandboxRestoreStatements())await db.prepare(sql).run();
 const tables=['work_jobs','agent_delegation_budget_pools','sky_tool_packages','sky_package_runtime_bindings','agent_delegations','agent_delegation_budget_reservations','agent_delegation_events','agent_delegation_inputs','a2a_usage_receipts','eve_conversations','eve_messages','eve_memory_terms'];
 for(const table of tables)for(const row of f.sqlite.prepare(`SELECT * FROM ${table}`).all()){const columns=Object.keys(row);await db.prepare(`INSERT INTO ${table}(${columns.map(c=>'"'+c+'"').join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...Object.values(row)).run();}
 async function call(method,input,{owner='alice',scope=owner,origin='http://localhost'}={}){const response=await mf.dispatchFetch('http://localhost/api/eve/agent-work'+(method==='GET'?'?id='+f.job.id+'&terms=1':''),{method,headers:{origin,'content-type':'application/json','oai-authenticated-user-id':owner,[OWNER_SCOPE_HEADER]:await ownerScopeFor(scope)},...(method==='GET'?{}:{body:JSON.stringify(input)})});return {status:response.status,data:await response.json()};}
 const base={jobId:f.job.id,sourceDelegationId:f.id,revision:f.job.revision};
 assert.equal((await call('PATCH',{...base,action:'register-author-agreement',authorAgreement:f.agreement,termsText:f.terms})).status,200);
 const bound=await call('PATCH',{...base,action:'bind-author-agreement',authorAgreement:f.agreement});assert.equal(bound.status,200);
 const allocated=await call('PATCH',{...base,revision:bound.data.job.revision,action:'prepare-author-allocation'});assert.equal(allocated.status,200);
 const display=await call('GET'),statement=display.data.children[0].collectionStatement;assert.equal(statement.collectionPlan.platformInvoiceCandidateMinor,50);
 const command={...base,revision:display.data.job.revision,action:'record-agent-collection-consent',statementDigest:statement.digest,amountMinor:50,currency:'USD',confirmed:true};
 assert.equal((await call('PATCH',{...command,amountMinor:120})).status,409);
 assert.equal((await call('PATCH',command,{owner:'bob',scope:'alice'})).status,409);
 assert.equal((await call('PATCH',command,{origin:'https://evil.invalid'})).status,403);
 const saved=await call('PATCH',command);assert.equal(saved.status,200);
 const replay=await call('PATCH',command);assert.equal(replay.status,200);assert.equal(replay.data.job.revision,saved.data.job.revision);
 const restored=await call('GET');assert.deepEqual(restored.data.job,saved.data.job);assert.equal(restored.data.children[0].collectionStatement.customerConsent,'recorded_pending_invoice_reconciliation');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sky_cloud_monthly_invoices').first()).n,0);
 await db.prepare("UPDATE agent_delegation_budget_reservations SET state='settled',settled_minor=120 WHERE delegation_id=?").bind(f.id).run();
 async function monthly(body,origin='http://localhost'){const r=await mf.dispatchFetch('http://localhost/api/sky/cloud-monthly-test/import',{method:'POST',headers:{origin,'content-type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
 const imported=await monthly({action:'import',kind:'a2a',id:f.id});assert.equal(imported.status,200,JSON.stringify(imported.data));assert.equal(imported.data.invoice.total_minor,50);
 const repeated=await monthly({action:'import',kind:'a2a',id:f.id});assert.equal(repeated.status,200);assert.equal(repeated.data.invoice.id,imported.data.invoice.id);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sky_cloud_monthly_items').first()).n,1);
 assert.equal((await monthly({action:'import',kind:'a2a',id:f.id},'https://evil.invalid')).status,403);
 async function settlement(owner='alice',scope=owner){const r=await mf.dispatchFetch('http://localhost/api/sky/cloud-monthly-test/account?settlement='+imported.data.invoice.id,{headers:{'oai-authenticated-user-id':owner,[OWNER_SCOPE_HEADER]:await ownerScopeFor(scope)}});return {status:r.status,data:await r.json()};}
 const held=await settlement();assert.equal(held.status,200);assert.equal(held.data.sources[0].authorPayableCandidateMinor,45);assert.equal(held.data.sources[0].status,'awaiting_collection');assert.equal(held.data.transferAllowed,false);assert.equal(held.data.ownerScope,await ownerScopeFor('alice'));
 assert.equal((await settlement('bob')).status,404);assert.equal((await settlement('bob','alice')).status,409);
 if(paymentEvidenceMode)await db.prepare("UPDATE sky_cloud_monthly_invoices SET stripe_invoice_id='in_fixture',stripe_customer_id='cus_fixture' WHERE id=?").bind(imported.data.invoice.id).run();
 await db.prepare("UPDATE sky_cloud_monthly_invoices SET status='paid' WHERE id=?").bind(imported.data.invoice.id).run();
 let providerEvidence=null;
 if(paymentEvidenceMode){
  providerInvoiceId=imported.data.invoice.id;
  const normal=await monthly({action:'inspect-payment',id:providerInvoiceId});assert.equal(normal.status,200,JSON.stringify(normal.data));assert.equal(normal.data.evidence.status,'no_reversal_observed');assert.equal(normal.data.evidence.transferAllowed,false);
  providerRefundPending=true;const pending=await monthly({action:'inspect-payment',id:providerInvoiceId});assert.equal(pending.status,200);assert.equal(pending.data.evidence.status,'refund_review_required');assert.equal(pending.data.evidence.refundedMinor,0);
  providerRefundPending=false;providerDisputed=true;const disputed=await monthly({action:'inspect-payment',id:providerInvoiceId});assert.equal(disputed.status,200);assert.equal(disputed.data.evidence.status,'reversal_observed');
  assert.equal((await monthly({action:'inspect-payment',id:providerInvoiceId},'https://evil.invalid')).status,403);
  assert.equal(providerReadCalls,12);
  providerFailure=true;const unknown=await monthly({action:'inspect-payment',id:providerInvoiceId});assert.equal(unknown.status,503);providerFailure=false;
  const beforeRestart=await settlement();assert.equal(beforeRestart.data.paymentObservation.state,'unknown');assert.equal(beforeRestart.data.paymentObservation.revision,4);assert.equal(beforeRestart.data.paymentObservation.reversalHold,true);assert.equal(beforeRestart.data.paymentObservation.lastEvidence.status,'reversal_observed');
  await mf.dispose();mf=runtime();await mf.ready;db=await mf.getD1Database('DB',config.name);
  const afterRestart=await settlement();assert.deepEqual(afterRestart.data.paymentObservation,beforeRestart.data.paymentObservation);assert.equal(providerReadCalls,13);
  providerEvidence={persistedObservationAfterRestart:true,unknownPreservesReversal:true,observationRevision:4,normalObserved:true,pendingRefundAtZeroHeld:true,disputeHeld:true,transferAllowed:false,simulatedProviderGetCalls:providerReadCalls,providerMutations:0,realProviderAccepted:false};
 }
 const historicalPaid=await settlement();assert.equal(historicalPaid.status,200);assert.equal(historicalPaid.data.sources[0].status,'awaiting_provider_reconciliation');assert.equal(historicalPaid.data.transferAllowed,false);assert.equal(historicalPaid.data.authorPayment,'unconfirmed');
 await db.prepare("UPDATE sky_author_agreement_documents SET revoked_at=?,revoked_by='publisher'").bind(Date.now()).run();
 assert.equal((await monthly({action:'import',kind:'a2a',id:f.id})).status,409);
 const revoked=await settlement();assert.equal(revoked.status,200);assert.equal(revoked.data.sources[0].status,'source_reconciliation_required');assert.equal(revoked.data.sources[0].publisherId,undefined);assert.equal(revoked.data.sources[0].authorPayableCandidateMinor,undefined);
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM sky_cloud_monthly_items').first()).n,1);
 assert.equal(externalCalls,0);
 console.log(JSON.stringify({status:'passed',scope:'built Worker HTTP/D1 synthetic author signatures and already-verified usage rows',job:f.job.id,revision:saved.data.job.revision,amountMinor:50,observedTotalMinor:120,invoiceCount:1,invoiceStatus:imported.data.invoice.status,invoiceTotalMinor:imported.data.invoice.total_minor,providerEvidence,settlementReport:{heldPayableCandidateMinor:45,historicalPaidStillHeld:true,foreignOwnerDenied:true,changedOwnerRejected:true,revokedRecipientAndAmountOmitted:true},monthlyReplayDeduplicated:true,revokedContractRejected:true,externalCalls,state}));
}finally{await mf.dispose();for(const g of clean)await g();}
