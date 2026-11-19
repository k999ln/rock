import {saveAgentMonthlyStatement,readAgentMonthlyStatement} from '../lib/sky-agent-monthly-statement.ts';
import {prepareAgentUsagePayment,skyUsagePayments} from '../lib/sky-usage-payment.ts';
import {agentUsageStatement} from '../lib/sky-agent-usage-statement.ts';
import {handleSkyPayments} from '../lib/sky-payments.ts';
import { prepareAuthorAllocation, parseAuthorRemunerationTerms } from '../lib/sky-author-remuneration.ts';
import { a2aPriceQuoteDigest } from '../lib/a2a-price-quote.ts';
import { authorAgreementDocuments } from '../lib/sky-author-agreement-documents.ts';
import { sha256Hex } from '../lib/rockstar-entitlement-claim.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveAgentWorkStore } from '../lib/eve-agent-work.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { SkyPackageRuntimeBindingStore } from '../lib/sky-package-runtime-binding-store.ts';
import { skyPackageRuntimeBindingDigest } from '../lib/sky-package-runtime-binding.ts';
import { authorUsageAgreementSigningBytes, verifyAuthorUsageAgreement } from '../lib/sky-author-usage-agreement.ts';
const uid=()=>crypto.randomUUID(),hex=bytes=>Buffer.from(bytes).toString('hex');
async function fixture(t, registerDocument=true, priced=false, authorGross=50, currency='USD', collection, shared, receiptIssuedAt=Date.now()) {
 const terms=priced?JSON.stringify({schema:collection?'sky.author-remuneration-terms/2':'sky.author-remuneration-terms/1',body:'Synthetic author-fee terms; payment pending.',authorCharge:{meter:'author_fee',unit:'request',commissionPolicy:'sky-marketplace-10pct/1'},...(collection?{collection}:{})}):'Synthetic contract test. No actual services or money.';
 const f=shared?{...shared,keys:shared.historyKeys}:eveAgentFixture(t),owner='alice',id=uid();
 const b={schema:'rockstar-sky-package-runtime-binding/2',providerId:'provider',keyId:'key',bindingId:shared?'binding-'+uid():'binding',agentOrigin:'https://fixture.example',agentName:'agent',agentVersion:'1',agentCardSha256:'a'.repeat(64),packageKey:'fixture@1',manifestSha256:'b'.repeat(64),operationId:'run',runtime:'a2a-jsonrpc-1.0',runtimeExtensionUri:'https://fixture.example/extension',inputSchemaSha256:'c'.repeat(64),outputSchemaSha256:'d'.repeat(64),pricingVersion:'v1',requiredUsage:[{meter:'request',unit:'request'}],issuedAt:Math.min(Date.now(),receiptIssuedAt)-1000,expiresAt:Date.now()+60000,signature:'fixture'};
 await new SkyPackageRuntimeBindingStore(f.db).register(b,'operator');
 f.sqlite.prepare('INSERT OR IGNORE INTO sky_tool_packages(package_key,tool_id,version,user_id,manifest,manifest_sha256,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').run(b.packageKey,'fixture','1','publisher','{}',b.manifestSha256,'verified',1,1);
 const job=(await eveAgentWorkStore(f.db,owner,f.keys).create({create:true,jobId:uid(),threadId:uid(),title:'Agreement fixture'})).job;
 const quote=priced?{schema:'rock-a2a-provider-price-quote/1',providerId:'provider',keyId:'quote-fixture',quoteId:uid(),agentOrigin:b.agentOrigin,agentName:'agent',agentVersion:'1',requestSha256:'a'.repeat(64),pricingVersion:'v1',pricingSha256:'a'.repeat(64),currency,estimateMinor:70+authorGross,maxAmountMinor:1000,issuedAt:Math.min(Date.now(),receiptIssuedAt)-1000,expiresAt:Date.now()+60000,usage:[{meter:'compute',unit:'second',quantity:7,unitPriceMinor:10,amountMinor:70},{meter:'author_fee',unit:'request',quantity:1,unitPriceMinor:authorGross,amountMinor:authorGross}],signature:'fixture'}:null;
 await a2aDelegationStore(f.db).prepare(owner,{id,parentJobId:job.id,idempotencyKey:uid(),messageId:uid(),targetOrigin:b.agentOrigin,targetAgentName:'agent',targetAgentVersion:'1',protocolVersion:'1.0',inputSha256:'a'.repeat(64),authorizationSha256:'b'.repeat(64),budgetCurrency:currency,budgetLimitMinor:priced?1000:1,parentBudgetLimitMinor:priced?2000:2,continueWhileDeviceOffline:true,deadlineAt:Date.now()+60000,...(quote?{priceQuote:quote,priceQuoteDigest:await a2aPriceQuoteDigest(quote)}:{}),packageRuntimeBindingId:b.bindingId,packageRuntimeBindingDigest:await skyPackageRuntimeBindingDigest(b)});
 if(priced) {const agents=a2aDelegationStore(f.db);await agents.approve(owner,id,'b'.repeat(64),{ciphertext:'fixture',nonce:'fixture',inputSha256:'a'.repeat(64),keyVersion:'aes-256-gcm-v1'});let row=await agents.claimDispatch(owner,id);row=await agents.beginRemoteSend(owner,id,row.revision);await agents.recordTaskReceipt(owner,id,row.revision,{id:'task-'+id,state:'TASK_STATE_COMPLETED'});}
 const receipt={ownerUserId:owner,parentJobId:job.id,delegationId:id,providerId:'provider',receiptId:'receipt-'+id,currency,amountMinor:priced?70+authorGross:1,pricingVersion:'v1',usage:priced?[{meter:'compute',unit:'second',quantity:7,amountMinor:70},{meter:'author_fee',unit:'request',quantity:1,amountMinor:authorGross}]:[{meter:'request',unit:'request',quantity:1,amountMinor:1}]};
 // Synthetic already-verified source rows; contract signatures below use two real Ed25519 key pairs.
 f.sqlite.prepare('INSERT INTO a2a_usage_receipts(delegation_id,owner_user_id,parent_job_id,provider_id,provider_reference,receipt_json,currency,amount_minor,issued_at,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,owner,job.id,'provider',receipt.receiptId,JSON.stringify(receipt),currency,receipt.amountMinor,receiptIssuedAt,Date.now());
 const a={schema:'sky.author-usage-agreement/1',id:uid(),version:'1',publisherId:'publisher',platformId:'rock',providerId:'provider',packageKey:b.packageKey,manifestSha256:b.manifestSha256,pricingVersion:'v1',termsSha256:await sha256Hex(terms),currency,issuedAt:Math.min(Date.now(),receiptIssuedAt)-1000,expiresAt:Date.now()+60000,authorKeyId:'author-key',platformKeyId:'platform-key',authorSignature:'',platformSignature:''};
 const pairs={},keys=shared?shared.keys:[];
 for(const role of (shared?[]:['author','platform'])) {
  pairs[role]=await crypto.subtle.generateKey({name:'Ed25519'},true,['sign','verify']);
  keys.push({role,principalId:role==='author'?'publisher':'rock',keyId:role==='author'?a.authorKeyId:a.platformKeyId,publicKeyHex:hex(await crypto.subtle.exportKey('raw',pairs[role].publicKey)),status:'active',packagePins:[{packageKey:b.packageKey,manifestSha256:b.manifestSha256}]});
 }
 async function sign(value) {if(shared)return shared.sign(value);const copy={...value};for(const role of ['author','platform']) copy[role+'Signature']=Buffer.from(await crypto.subtle.sign({name:'Ed25519'},pairs[role].privateKey,authorUsageAgreementSigningBytes(copy))).toString('base64url');return copy;}
 const agreement=await sign(a),config=()=>JSON.stringify(keys),eve=()=>eveAgentWorkStore(f.db,owner,f.keys,undefined,config());
 const captured=(await eve().command({jobId:job.id,action:'sync'})).job;
 if(registerDocument) await authorAgreementDocuments(f.db).register(agreement,terms,captured.eveAgent.usageSources[0],config());
 const bind=(value=agreement,revision=captured.revision)=>eve().command({jobId:job.id,action:'bind-author-agreement',sourceDelegationId:id,revision,authorAgreement:value});
 return {...f,terms,historyKeys:f.keys,id,job:captured,agreement,keys,sign,config,eve,bind};
}
void test('two scoped signatures bind the captured receipt once; replay is stable and no money is allocated',async t=>{
 const f=await fixture(t),before=f.sqlite.prepare('SELECT * FROM a2a_usage_receipts').all();
 const a=await f.bind(),b=await f.bind();assert.equal(a.job.revision,b.job.revision);assert.equal(a.job.eveAgent.usageSources.length,1);assert.deepEqual(a.job.eveAgent.usageSources,b.job.eveAgent.usageSources);assert.equal(a.children[0].authorAgreementStatus,'agreement_bound_pending_collection');assert.equal(a.job.eveAgent.usageSources[0].authorAgreement.amountMinor,null);assert.deepEqual(f.sqlite.prepare('SELECT * FROM a2a_usage_receipts').all(),before);
 await assert.rejects(f.bind(await f.sign({...f.agreement,version:'2'})),/別の契約/);
 const history=await eveHistoryStore(f.db,'alice',f.historyKeys,true).get(f.job.eveAgent.threadId);const text=history.session.messages.at(-1).text;assert.match(text,/契約署名照合済み/);assert.ok(!text.includes(f.agreement.authorSignature));
});
void test('missing trust, tampering, swapped roles, wrong pins, expiry and same signer for both roles fail closed',async t=>{
 const f=await fixture(t),source=f.job.eveAgent.usageSources[0];
 await assert.rejects(verifyAuthorUsageAgreement(f.agreement,source),/署名/);
 for(const patch of [{termsSha256:'f'.repeat(64)},{publisherId:'other'},{providerId:'other'},{pricingVersion:'other'},{currency:'JPY'},{extra:true}]) await assert.rejects(f.bind({...f.agreement,...patch}),/署名/);
 await assert.rejects(f.bind({...f.agreement,authorSignature:f.agreement.platformSignature}),/署名/);
 await assert.rejects(f.bind(await f.sign({...f.agreement,expiresAt:Date.now()-1})),/署名/);
 const badKeys=structuredClone(f.keys);badKeys[0].packagePins=[];await assert.rejects(verifyAuthorUsageAgreement(f.agreement,source,JSON.stringify(badKeys)),/署名/);
 badKeys[0]=structuredClone(f.keys[0]);badKeys[1].publicKeyHex=badKeys[0].publicKeyHex;await assert.rejects(verifyAuthorUsageAgreement(f.agreement,source,JSON.stringify(badKeys)),/署名/);
});
void test('revocation preserves the saved contract but marks current eligibility unavailable',async t=>{
 const f=await fixture(t),a=await f.bind();f.keys[0].status='revoked';const b=await f.eve().command({jobId:f.job.id,action:'sync'});assert.equal(b.children[0].authorAgreementStatus,'agreement_unavailable');assert.deepEqual(b.job.eveAgent.usageSources,a.job.eveAgent.usageSources);await assert.rejects(f.bind(),/署名/);
});
void test('stale revision, wrong owner, changed publisher, stop and concurrent binding cannot overwrite the captured association',async t=>{
 const f=await fixture(t);await assert.rejects(f.bind(f.agreement,0),/再読込/);
 await assert.rejects(eveAgentWorkStore(f.db,'bob',f.keys,undefined,f.config()).command({jobId:f.job.id,action:'bind-author-agreement',sourceDelegationId:f.id,revision:f.job.revision,authorAgreement:f.agreement}),e=>e.status===404);
 const outcomes=await Promise.allSettled([f.bind(),f.bind()]);assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);assert.equal(outcomes.find(x=>x.status==='rejected').reason.status,409);
 const latest=(await f.eve().read(f.job.id)).job;
 await f.eve().command({jobId:f.job.id,action:'stop',revision:latest.revision,commandId:uid()});await assert.rejects(f.bind(),/停止済み/);
 const g=await fixture(t);g.sqlite.prepare('UPDATE sky_tool_packages SET user_id=? WHERE package_key=?').run('replacement','fixture@1');await assert.rejects(g.bind(),/利用元/);
});

void test('older captures missing currency/time and retroactive signed terms need explicit migration rather than guessed acceptance',async t=>{
 const f=await fixture(t),source=structuredClone(f.job.eveAgent.usageSources[0]);delete source.provenance.currency;delete source.provenance.receiptIssuedAt;
 await assert.rejects(verifyAuthorUsageAgreement(f.agreement,source,f.config()),/署名/);
 const futureIssue=f.job.eveAgent.usageSources[0].provenance.receiptIssuedAt+1;
 await assert.rejects(verifyAuthorUsageAgreement(await f.sign({...f.agreement,issuedAt:futureIssue}),f.job.eveAgent.usageSources[0],f.config(),futureIssue+1),/署名/);
});

void test('signed terms must match exact registered bytes before source binding, with immutable replay and version conflicts',async t=>{
 const f=await fixture(t,false),docs=authorAgreementDocuments(f.db),source=f.job.eveAgent.usageSources[0];
 await assert.rejects(f.bind(),/本文/);await assert.rejects(docs.register(f.agreement,f.terms+'changed',source,f.config()),/hash/);
 await assert.rejects(docs.register(f.agreement,'x'.repeat(8001),source,f.config()),e=>e.status===400);
 const a=await docs.register(f.agreement,f.terms,source,f.config()),b=await docs.register(f.agreement,f.terms,source,f.config());assert.deepEqual(a,b);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM sky_author_agreement_documents').get().n,1);
 const other=f.terms+' replacement',signed=await f.sign({...f.agreement,termsSha256:await sha256Hex(other)});await assert.rejects(docs.register(signed,other,source,f.config()),/同じ契約版/);
 assert.throws(()=>f.sqlite.prepare('UPDATE sky_author_agreement_documents SET terms_text=?').run('changed'),/IMMUTABLE/);assert.throws(()=>f.sqlite.exec('DELETE FROM sky_author_agreement_documents'),/IMMUTABLE/);
 await f.bind();const bound=await f.eve().read(f.job.id,true);assert.equal(bound.children[0].agreementDocument.termsText,f.terms);
});
void test('contract-specific revocation retains the original body and blocks eligibility and rebinding',async t=>{
 const f=await fixture(t),docs=authorAgreementDocuments(f.db);await f.bind();
 await assert.rejects(docs.revoke(f.agreement,'other'),e=>e.status===403);const a=await docs.revoke(f.agreement,'publisher'),b=await docs.revoke(f.agreement,'publisher');assert.deepEqual(a,b);
 const result=await f.eve().read(f.job.id,true);assert.equal(result.children[0].authorAgreementStatus,'agreement_unavailable');assert.equal(result.children[0].agreementDocument.revoked,true);assert.equal(result.children[0].agreementDocument.termsText,f.terms);await assert.rejects(f.bind(),/本文/);
 assert.throws(()=>f.sqlite.prepare('UPDATE sky_author_agreement_documents SET revoked_at=NULL,revoked_by=NULL').run(),/IMMUTABLE/);
});
void test('revocation after preflight before parent CAS prevents a new association atomically',async t=>{
 const f=await fixture(t),prepare=f.db.prepare;let fired=false;
 f.db.prepare=query=>{const statement=prepare(query);if(!query.startsWith('UPDATE work_jobs'))return statement;return {...statement,bind(...args){const bound=statement.bind(...args);return {...bound,async run(){if(!fired){fired=true;f.sqlite.prepare('UPDATE sky_author_agreement_documents SET revoked_at=?,revoked_by=?').run(Date.now(),'publisher');}return bound.run();}};}};};
 await assert.rejects(f.bind(),/有効性が変わり/);const saved=await f.eve().read(f.job.id);assert.equal(saved.job.eveAgent.usageSources[0].authorAgreement,undefined);
});

void test('explicit author line uses the existing marketplace commission without taxing other Provider usage; candidate is saved once and never paid',async t=>{
 const f=await fixture(t,true,true),bound=await f.bind(),source=bound.job.eveAgent.usageSources[0];
 const action={jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'};
 const a=await f.eve().command(action),b=await f.eve().command(action);assert.equal(a.job.revision,b.job.revision);const plan=a.children[0].authorAllocation;
 assert.equal(plan.receiptTotalMinor,120);assert.equal(plan.otherUsageMinor,70);assert.equal(plan.allocation.grossMinor,50);assert.equal(plan.allocation.commissionMinor,5);assert.equal(plan.allocation.payableMinor,45);assert.equal(plan.allocation.transferRef,null);assert.equal(plan.status,'pending_invoice_and_collection');assert.deepEqual(a.job.eveAgent.usageSources,b.job.eveAgent.usageSources);
 for(const table of ['sky_usage_payments','sky_commerce_orders','sky_linux_service_receipts']) assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM '+table).get().n,0);
 const wrong=JSON.stringify({...JSON.parse(f.terms),authorCharge:{...JSON.parse(f.terms).authorCharge,meter:'missing'}});await assert.rejects(prepareAuthorAllocation(f.db,'alice',f.job.id,source,wrong),/項目/);
 const quote=JSON.parse(f.sqlite.prepare('SELECT price_quote_json q FROM agent_delegations WHERE id=?').get(f.id).q);quote.usage[1].unitPriceMinor=99;f.sqlite.prepare('UPDATE agent_delegations SET price_quote_json=? WHERE id=?').run(JSON.stringify(quote),f.id);await assert.rejects(f.eve().command(action),/見積/);
});
void test('unstructured or unagreed fees stay unknown and invalid fee policies cannot be registered',async t=>{
 const f=await fixture(t),bound=await f.bind();await assert.rejects(f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'}),/計算可能/);
 assert.equal(parseAuthorRemunerationTerms(f.terms),null);assert.throws(()=>parseAuthorRemunerationTerms(JSON.stringify({schema:'sky.author-remuneration-terms/1',body:'invalid',authorCharge:{meter:'request',unit:'request',commissionPolicy:'apply-to-every-provider'}})),e=>e.status===400);
});
void test('revoked source agreement prevents new allocation, while an existing held candidate remains a historical reference',async t=>{
 const f=await fixture(t,true,true),bound=await f.bind(),a=await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
 await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');await assert.rejects(f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:a.job.revision,action:'prepare-author-allocation'}),/契約結合/);
 const b=await f.eve().read(f.job.id);assert.deepEqual(b.children[0].authorAllocation,a.children[0].authorAllocation);assert.equal(b.children[0].authorAgreementStatus,'agreement_unavailable');
});

void test('JPY stays in its original minor units and uses integer floor commission on the explicit author fee',async t=>{
 const f=await fixture(t,true,true,19,'JPY'),bound=await f.bind(),x=await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'}),p=x.children[0].authorAllocation;
 assert.equal(p.currency,'JPY');assert.equal(p.receiptTotalMinor,89);assert.equal(p.otherUsageMinor,70);assert.equal(p.allocation.grossMinor,19);assert.equal(p.allocation.commissionMinor,1);assert.equal(p.allocation.payableMinor,18);
});

void test('existing payment statement surface resolves only the current owned Agent source and never creates a collection',async t=>{
 const f=await fixture(t,true,true);const bound=await f.bind();
 await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
 const a=await agentUsageStatement(f.db,'alice',f.id,f.config()),b=await agentUsageStatement(f.db,'alice',f.id,f.config());
 assert.deepEqual(a,b);assert.equal(a.observedAmountMinor,120);assert.equal(a.authorGrossMinor,50);assert.equal(a.commissionMinor,5);assert.equal(a.authorPayableCandidateMinor,45);assert.equal(a.otherUsageMinor,70);assert.equal(a.collection,'not_configured');assert.equal(a.customerPayment,'unconfirmed');assert.equal(a.providerInvoice,'unreconciled');
 const origin='https://sky.fixture.chatgpt.site',runtime={SKY_PAYMENT_ORIGIN:origin,SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS:f.config()};
 const request=(body,owner='alice')=>new Request(origin+'/api/sky/payments/statement',{method:'POST',headers:{origin,'content-type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify(body)});
 const fetcher=async()=>assert.fail('statement cannot call payment provider');
 const response=await handleSkyPayments(request({source:'sky_agent',sourceId:f.id}),'statement',f.db,runtime,fetcher);assert.equal(response.status,200);assert.deepEqual(await response.json(),a);
 assert.equal((await handleSkyPayments(request({source:'sky_agent',sourceId:f.id},'bob'),'statement',f.db,runtime,fetcher)).status,404);
 assert.equal((await handleSkyPayments(request({source:'unknown',sourceId:f.id}),'statement',f.db,runtime,fetcher)).status,400);
 assert.equal((await handleSkyPayments(request({source:'sky_agent',sourceId:f.id,digest:a.digest,amountMinor:120,currency:'USD'}),'checkout',f.db,runtime,fetcher)).status,400);
 for(const table of ['sky_usage_payments','sky_commerce_orders','sky_linux_service_documents'])assert.equal(f.sqlite.prepare('SELECT count(*) n FROM '+table).get().n,0);
 await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');await assert.rejects(agentUsageStatement(f.db,'alice',f.id,f.config()),e=>e.status===409);
});
void test('Agent payment statement rejects missing trust, missing candidate and candidate tampering without changing usage',async t=>{
 const f=await fixture(t,true,true);const bound=await f.bind();await assert.rejects(agentUsageStatement(f.db,'alice',f.id,f.config()),e=>e.status===409);
 const prepared=await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
 await assert.rejects(agentUsageStatement(f.db,'alice',f.id),e=>e.status===409);
 const job=structuredClone(prepared.job);job.eveAgent.usageSources[0].authorAllocation.allocation.payableMinor=46;
 f.sqlite.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(job),job.id);
 await assert.rejects(agentUsageStatement(f.db,'alice',f.id,f.config()),e=>e.status===409);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM a2a_usage_receipts').get().n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,0);
});

void test('signed collection route keeps BYOK compute outside the platform invoice candidate and never grants collection consent',async t=>{
 for(const [mode,chargeScope,usageFunding,expected] of [['platform_invoice','author_fee','byok',50],['platform_invoice','receipt_total','platform',120],['external_provider','none','byok',null]]) {
  const f=await fixture(t,true,true,50,'USD',{mode,chargeScope,usageFunding,refundPolicy:'itemized_source/1'}),bound=await f.bind();
  await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
  const statement=await agentUsageStatement(f.db,'alice',f.id,f.config()),plan=statement.collectionPlan;
  assert.equal(plan.platformInvoiceCandidateMinor,expected);assert.equal(plan.customerConsent,'missing');assert.equal(plan.providerInvoice,'unreconciled');assert.equal(plan.invoice,'not_created');assert.equal(statement.collection,'not_configured');assert.equal(statement.customerPayment,'unconfirmed');
  assert.equal(plan.receiptSha256,statement.receiptSha256);assert.equal(plan.agreementSha256,statement.agreementSha256);assert.equal(plan.allocationCandidateId,statement.allocationCandidateId);
  if(usageFunding==='byok' && mode==='platform_invoice')assert.equal(plan.excludedOtherUsageMinor,70);
  assert.deepEqual(await agentUsageStatement(f.db,'alice',f.id,f.config()),statement);
  assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,0);
 }
});
void test('collection terms reject implicit BYOK resale, unknown policy and extra fields; old signed terms stay unconfigured',async t=>{
 const base={schema:'sky.author-remuneration-terms/2',body:'Synthetic only',authorCharge:{meter:'author_fee',unit:'request',commissionPolicy:'sky-marketplace-10pct/1'},collection:{mode:'platform_invoice',chargeScope:'author_fee',usageFunding:'byok',refundPolicy:'itemized_source/1'}};
 for(const collection of [{...base.collection,chargeScope:'receipt_total'},{...base.collection,mode:'external_provider'},{...base.collection,mode:'other'},{...base.collection,refundPolicy:'automatic'},{...base.collection,customerConsent:'accepted'}]) assert.throws(()=>parseAuthorRemunerationTerms(JSON.stringify({...base,collection})),e=>e.status===400);
 const f=await fixture(t,true,true),b=await f.bind();await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:b.job.revision,action:'prepare-author-allocation'});assert.equal((await agentUsageStatement(f.db,'alice',f.id,f.config())).collectionPlan,null);
 const altered=await f.sign({...f.agreement,termsSha256:await sha256Hex(JSON.stringify(base))});await assert.rejects(f.bind(altered,b.job.revision),e=>e.status===409);
});

async function consentFixture(t,collection={mode:'platform_invoice',chargeScope:'author_fee',usageFunding:'byok',refundPolicy:'itemized_source/1'}) {
 const f=await fixture(t,true,true,50,'USD',collection),bound=await f.bind();await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
 const statement=()=>agentUsageStatement(f.db,'alice',f.id,f.config()),initial=await statement();
 const input={jobId:f.job.id,revision:initial.jobRevision,sourceDelegationId:f.id,action:'record-agent-collection-consent',statementDigest:initial.digest,amountMinor:50,currency:'USD',confirmed:true};
 return {...f,statement,initial,input};
}
void test('owner confirmation binds exact statement/amount/currency once, survives reopening, and never collects money',async t=>{
 const f=await consentFixture(t);
 for(const patch of [{statementDigest:'a'.repeat(64)},{amountMinor:120},{currency:'JPY'},{confirmed:false},{revision:f.input.revision-1}]) await assert.rejects(f.eve().command({...f.input,...patch}),e=>e.status===409);
 await assert.rejects(eveAgentWorkStore(f.db,'bob',f.historyKeys,undefined,f.config()).command(f.input),e=>e.status===404);
 const a=await f.eve().command(f.input),b=await f.eve().command(f.input);assert.equal(a.job.revision,b.job.revision);
 const consent=a.job.eveAgent.usageSources[0].collectionConsent;assert.equal(consent.ownerId,'alice');assert.equal(consent.amountMinor,50);assert.equal(consent.statementDigest,f.initial.digest);
 const current=await f.statement();assert.equal(current.digest,f.initial.digest);assert.equal(current.customerConsent,'recorded_pending_invoice_reconciliation');assert.equal(current.collectionPlan.status,'awaiting_invoice_reconciliation');assert.equal(current.collectionPlan.invoice,'not_created');assert.equal(current.customerPayment,'unconfirmed');assert.equal(current.collection,'not_configured');
 assert.deepEqual(current.collectionConsent,consent);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,0);
 const history=await eveHistoryStore(f.db,'alice',f.historyKeys,true).get(f.job.eveAgent.threadId);assert.match(history.session.messages.at(-1).text,/本人アカウント確認記録あり/);
 await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');await assert.rejects(f.eve().command(f.input),e=>e.status===409);await assert.rejects(f.statement(),e=>e.status===409);
 assert.deepEqual((await f.eve().read(f.job.id)).job.eveAgent.usageSources[0].collectionConsent,consent);
});
void test('parallel owner confirmations converge through parent CAS, while revocation wins the atomic document fence',async t=>{
 const f=await consentFixture(t),results=await Promise.allSettled([f.eve().command(f.input),f.eve().command(f.input)]);assert.ok(results.some(r=>r.status==='fulfilled'));
 for(const r of results)if(r.status==='rejected')assert.equal(r.reason.status,409);
 const final=await f.statement();assert.equal(final.jobRevision,f.input.revision+1);assert.ok(final.collectionConsent);
 const g=await consentFixture(t),prepare=g.db.prepare;let fired=false;
 g.db.prepare=query=>{const s=prepare(query);if(!query.startsWith('UPDATE work_jobs'))return s;return {...s,bind(...args){const bound=s.bind(...args);return {...bound,async run(){if(!fired){fired=true;await authorAgreementDocuments(g.db).revoke(g.agreement,'publisher');}return bound.run();}};}};};
 await assert.rejects(g.eve().command(g.input),e=>e.status===409);assert.equal((await g.eve().read(g.job.id)).job.eveAgent.usageSources[0].collectionConsent,undefined);
});
void test('confirmation cannot create a platform invoice for direct Provider terms, and stopped work never revives',async t=>{
 const external=await consentFixture(t,{mode:'external_provider',chargeScope:'none',usageFunding:'byok',refundPolicy:'itemized_source/1'});await assert.rejects(external.eve().command(external.input),e=>e.status===409);
 const f=await consentFixture(t),stopped=await f.eve().command({jobId:f.job.id,revision:f.input.revision,action:'stop',commandId:uid()});assert.equal(stopped.job.status,'cancelled');
 const before=await f.statement(),recorded=await f.eve().command({...f.input,revision:before.jobRevision});assert.equal(recorded.job.status,'cancelled');assert.equal(recorded.job.eveAgent.stopRequestedAt,stopped.job.eveAgent.stopRequestedAt);assert.equal(recorded.job.eveAgent.usageSources[0].collectionConsent.amountMinor,50);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM agent_delegations').get().n,1);
});

async function agentInvoiceFixture(t,gross=50,currency='USD',shared,receiptIssuedAt) {
 const f=await fixture(t,true,true,gross,currency,{mode:'platform_invoice',chargeScope:'author_fee',usageFunding:'byok',refundPolicy:'itemized_source/1'},shared,receiptIssuedAt),bound=await f.bind();await f.eve().command({jobId:f.job.id,sourceDelegationId:f.id,revision:bound.job.revision,action:'prepare-author-allocation'});
 const statement=await agentUsageStatement(f.db,'alice',f.id,f.config()),input={sourceId:f.id,digest:statement.digest,amountMinor:gross,currency};
 const confirm=()=>f.eve().command({jobId:f.job.id,revision:statement.jobRevision,sourceDelegationId:f.id,action:'record-agent-collection-consent',statementDigest:statement.digest,amountMinor:gross,currency,confirmed:true});
 const runtime={SKY_PAYMENTS_MODE:'test',SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED:'true',SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS:f.config(),SKY_STRIPE_SECRET_KEY:'rk_test_fixture',SKY_STRIPE_WEBHOOK_SECRET:'whsec_fixture',SKY_USAGE_STRIPE_WEBHOOK_SECRET:'whsec_usage',SKY_PAYMENT_ORIGIN:'https://sky.fixture.chatgpt.site'};
 return {...f,statement,input,confirm,runtime};
}
void test('confirmed Agent preparation uses the existing payment store once and cannot enter a payment provider or a paid state',async t=>{
 const f=await agentInvoiceFixture(t);await assert.rejects(prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input),e=>e.status===409);await f.confirm();
 await assert.rejects(prepareAgentUsagePayment(f.db,'alice',{...f.runtime,SKY_PAYMENTS_MODE:'live'},f.input),e=>e.status===503);
 await assert.rejects(prepareAgentUsagePayment(f.db,'alice',{...f.runtime,SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED:'false'},f.input),e=>e.status===503);
 await assert.rejects(prepareAgentUsagePayment(f.db,'bob',f.runtime,f.input),e=>e.status===404);
 await assert.rejects(prepareAgentUsagePayment(f.db,'alice',f.runtime,{...f.input,amountMinor:120}),e=>e.status===409);
 const [a,b]=await Promise.all([prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input),prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input)]);assert.deepEqual(a,b);assert.equal(a.status,'prepared');assert.equal(a.source,'sky_agent');assert.equal(a.amountMinor,50);assert.equal(a.invoice,'not_created');assert.equal(a.customerPayment,'unconfirmed');
 const row=f.sqlite.prepare('SELECT * FROM sky_usage_payments').get();assert.equal(row.source_id,null);assert.equal(row.agent_source_id,f.id);assert.equal(row.confirmation_id,a.confirmationId);assert.equal(row.session_id,null);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions').get().n,0);
 assert.throws(()=>f.sqlite.prepare('UPDATE sky_usage_payments SET state=?').run('paid'));assert.throws(()=>f.sqlite.prepare('UPDATE sky_usage_payments SET amount_minor=?').run(120));assert.throws(()=>f.sqlite.prepare('UPDATE sky_usage_payments SET session_id=?').run('cs_forged'));assert.throws(()=>f.sqlite.exec('DELETE FROM sky_usage_payments'));
 await assert.rejects(skyUsagePayments(f.db,f.runtime,async()=>assert.fail('prepared Agent cannot contact Stripe')).confirm('alice',a.id),e=>e.status===409);
 const request=new Request(f.runtime.SKY_PAYMENT_ORIGIN+'/api/sky/payments/prepare-agent-invoice',{method:'POST',headers:{origin:f.runtime.SKY_PAYMENT_ORIGIN,'content-type':'application/json','oai-authenticated-user-id':'alice'},body:JSON.stringify(f.input)});
 const response=await handleSkyPayments(request,'prepare-agent-invoice',f.db,f.runtime,async()=>assert.fail('preparation must not call provider'));assert.equal(response.status,200);assert.deepEqual(await response.json(),a);
});
void test('Agent preparation accepts original JPY minor units below checkout minimum and never rounds up',async t=>{
 const f=await agentInvoiceFixture(t,19,'JPY');await f.confirm();const row=await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);assert.equal(row.currency,'jpy');assert.equal(row.amountMinor,19);assert.equal(row.status,'prepared');
});
void test('Agent preparation insert atomically rejects a contract revoked after statement verification',async t=>{
 const f=await agentInvoiceFixture(t);await f.confirm();const prepare=f.db.prepare;let fired=false;
 f.db.prepare=query=>{const s=prepare(query);if(!query.startsWith('INSERT INTO sky_usage_payments'))return s;return {...s,bind(...args){const bound=s.bind(...args);return {...bound,async run(){if(!fired){fired=true;await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');}return bound.run();}};}};};
 await assert.rejects(prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input),e=>e.status===409);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,0);
});

void test('Eve job payment summary keeps old owned sources visible beyond the account window and never crosses owner or job',async t=>{
 const f=await agentInvoiceFixture(t);await f.confirm();const prepared=await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);
 // Already-verified-store fixtures only: 101 newer receipts belong to a different job.
 const insert=f.sqlite.prepare(`INSERT INTO a2a_usage_receipts SELECT ?,owner_user_id,?,provider_id,?,receipt_json,currency,amount_minor,issued_at,received_at+? FROM a2a_usage_receipts WHERE delegation_id=?`);
 for(let i=0;i<101;i++)insert.run('other-'+i,'other-job','other-ref-'+i,i+1,f.id);
 const read=(query,owner='alice')=>handleSkyPayments(new Request(f.runtime.SKY_PAYMENT_ORIGIN+'/api/sky/payments/agent-summary?'+query,{headers:{'oai-authenticated-user-id':owner}}),'agent-summary',f.db,f.runtime,async()=>assert.fail('summary must not call a provider'));
 const response=await read('job='+f.job.id);assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const body=await response.json();
 assert.deepEqual(body.agentUsage.map(row=>row.id),[f.id]);assert.deepEqual(body.collections.map(row=>row.id),[prepared.id]);assert.equal(body.agentInvoicePreparationEnabled,true);assert.deepEqual(body.cloud,[]);assert.deepEqual(body.purchases,[]);
 const noKeys={SKY_PAYMENT_ORIGIN:f.runtime.SKY_PAYMENT_ORIGIN};const readonly=await handleSkyPayments(new Request(f.runtime.SKY_PAYMENT_ORIGIN+'/api/sky/payments/agent-summary?job='+f.job.id,{headers:{'oai-authenticated-user-id':'alice'}}),'agent-summary',f.db,noKeys,async()=>assert.fail('no credentials needed for a read'));assert.equal(readonly.status,200);const unconfigured=await readonly.json();assert.equal(unconfigured.mode,'unconfigured');assert.equal(unconfigured.agentUsage.length,1);assert.equal(unconfigured.agentInvoicePreparationEnabled,false);assert.deepEqual(unconfigured.collections,[]);
 const other=await read('job='+f.job.id,'bob');assert.equal(other.status,200);const hidden=await other.json();assert.deepEqual(hidden.agentUsage,[]);assert.deepEqual(hidden.collections,[]);
 assert.equal((await read('job=other-job')).status,409);assert.equal((await read('job='+f.job.id+'&job=other-job')).status,400);assert.equal((await read('job='+f.job.id+'&owner=bob')).status,400);assert.equal((await read('')).status,400);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,1);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions').get().n,0);
});

void test('monthly drafts reference each existing preparation once, append late sources and preserve per-source JPY rounding',async t=>{
 const f=await agentInvoiceFixture(t,19,'JPY');await f.confirm();await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);const period=new Date().toISOString().slice(0,7);
 const first=await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY');assert.equal(first.revision,0);assert.equal(first.statement.amountMinor,19);assert.equal(first.statement.commissionMinor,1);assert.equal(first.statement.baseMinor,0);assert.equal(first.statement.invoice,'not_created');
 assert.deepEqual(await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY'),first);
 const concurrent=await Promise.all([saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY'),saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY')]);assert.deepEqual(concurrent,[first,first]);
 const next=await agentInvoiceFixture(t,19,'JPY',f);await next.confirm();await prepareAgentUsagePayment(next.db,'alice',next.runtime,next.input);
 const second=await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY');assert.equal(second.statement.id,first.statement.id);assert.equal(second.revision,1);assert.equal(second.statement.items.length,2);assert.equal(second.statement.amountMinor,38);assert.equal(second.statement.observedMinor,178);assert.equal(second.statement.commissionMinor,2);assert.equal(second.statement.authorPayableMinor,36);
 const usd=await agentInvoiceFixture(t,50,'USD',f);await usd.confirm();await prepareAgentUsagePayment(usd.db,'alice',usd.runtime,usd.input);assert.deepEqual(await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY'),second);
 assert.equal((await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'USD')).statement.amountMinor,50);
 const http=(action,input,owner='alice')=>handleSkyPayments(new Request(f.runtime.SKY_PAYMENT_ORIGIN+'/api/sky/payments/'+action,{method:'POST',headers:{origin:f.runtime.SKY_PAYMENT_ORIGIN,'content-type':'application/json','oai-authenticated-user-id':owner},body:JSON.stringify(input)}),action,f.db,f.runtime,async()=>assert.fail('monthly snapshots cannot call provider'));
 assert.deepEqual(await(await http('monthly-save',{period,currency:'JPY'})).json(),second);assert.equal((await http('monthly-read',{id:second.statement.id},'bob')).status,404);assert.equal((await http('monthly-save',{period,currency:'JPY',amountMinor:1})).status,400);
 assert.deepEqual(await readAgentMonthlyStatement(f.db,'alice',second.statement.id),second);await assert.rejects(readAgentMonthlyStatement(f.db,'bob',second.statement.id),e=>e.status===404);
 await assert.rejects(saveAgentMonthlyStatement(f.db,'bob',f.runtime,period,'JPY'),e=>e.status===409);await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',{...f.runtime,SKY_PAYMENTS_MODE:'live'},period,'JPY'),e=>e.status===503);await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,'2999-01','JPY'));await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,'2026-13','JPY'));
 const update=payload=>f.sqlite.prepare('UPDATE sky_linux_service_documents SET payload=?,revision=revision+1 WHERE id=?').run(JSON.stringify(payload),second.statement.id);
 assert.throws(()=>update({...second.statement,items:[second.statement.items[0]],amountMinor:19,observedMinor:89,authorGrossMinor:19,commissionMinor:1,authorPayableMinor:18,otherUsageMinor:70}));assert.throws(()=>update({...second.statement,amountMinor:39}));assert.throws(()=>update({...second.statement,collection:'enabled'}));assert.throws(()=>f.sqlite.prepare('DELETE FROM sky_linux_service_documents WHERE id=?').run(second.statement.id));
 await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'JPY'),e=>e.status===409);assert.deepEqual(await readAgentMonthlyStatement(f.db,'alice',second.statement.id),second);
 assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,3);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM remote_ai_text_executions').get().n,0);
});
void test('monthly document commit rejects a contract revoked after verification without changing the prepared source',async t=>{
 const f=await agentInvoiceFixture(t);await f.confirm();await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);const prepare=f.db.prepare;let revoked=false;
 f.db.prepare=query=>{const s=prepare(query);if(!query.startsWith('INSERT INTO sky_linux_service_documents'))return s;return {...s,bind(...args){const b=s.bind(...args);return {...b,async run(){if(!revoked){revoked=true;await authorAgreementDocuments(f.db).revoke(f.agreement,'publisher');}return b.run();}};}};};
 await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,new Date().toISOString().slice(0,7),'USD'),e=>e.status===409);
 assert.equal(f.sqlite.prepare("SELECT count(*) n FROM sky_linux_service_documents WHERE kind='agent_monthly_statement'").get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,1);
});

void test('monthly grouping follows the original receipt UTC month even when preparation and receipt arrival are later',async t=>{
 const now=new Date(),boundary=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1),issued=boundary-1,period=new Date(issued).toISOString().slice(0,7);
 const f=await agentInvoiceFixture(t,50,'USD',undefined,issued);await f.confirm();await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);
 assert.ok(f.sqlite.prepare('SELECT received_at FROM a2a_usage_receipts WHERE delegation_id=?').get(f.id).received_at>=boundary);
 await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,now.toISOString().slice(0,7),'USD'),e=>e.status===409);
 const saved=await saveAgentMonthlyStatement(f.db,'alice',f.runtime,period,'USD');assert.equal(saved.statement.period,period);assert.equal(saved.statement.amountMinor,50);
});
void test('monthly commit checks document expiry against the database clock after asynchronous signature verification',async t=>{
 const f=await agentInvoiceFixture(t);await f.confirm();await prepareAgentUsagePayment(f.db,'alice',f.runtime,f.input);
 // Advance only the SQLite fixture clock used at commit; planner/server validation still sees current time.
 f.sqlite.function('julianday',clock=>{assert.equal(clock,'now');return 2440587.5+(Date.now()+120000)/86400000;});
 await assert.rejects(saveAgentMonthlyStatement(f.db,'alice',f.runtime,new Date().toISOString().slice(0,7),'USD'),e=>e.status===409);
 assert.equal(f.sqlite.prepare("SELECT count(*) n FROM sky_linux_service_documents WHERE kind='agent_monthly_statement'").get().n,0);assert.equal(f.sqlite.prepare('SELECT count(*) n FROM sky_usage_payments').get().n,1);
});
