import test from 'node:test';
import assert from 'node:assert/strict';
import { observeLlmUsage, observeStoredAgentUsage, observeSavedFreeCloudUsage, readSkyUsageObservation } from '../lib/sky-usage-observation.ts';
import { generateText } from '../lib/llm-providers.ts';
const metric=(observation,key)=>observation.metrics.find(item=>item.meter===key)?.quantity;
void test('provider-specific cache and thinking semantics stay separate; unknown does not become zero',()=>{
  const a=observeLlmUsage('anthropic',{usage:{input_tokens:7,output_tokens:3,cache_read_input_tokens:20,cache_creation_input_tokens:4}});
  assert.equal(metric(a,'uncached_input_tokens'),7);assert.equal(metric(a,'cache_read_input_tokens'),20);
  assert.equal(a.amountMinor,null);assert.equal(a.developerPayment.amountMinor,null);
  const g=observeLlmUsage('google',{usageMetadata:{promptTokenCount:10,candidatesTokenCount:4,thoughtsTokenCount:8,totalTokenCount:22,cachedContentTokenCount:5}});
  assert.equal(metric(g,'reasoning_output_tokens'),8);assert.equal(metric(g,'total_tokens'),22);
  assert.equal(g.metrics.find(x=>x.meter==='cached_input_tokens').relationship,'subset');
  assert.equal(observeLlmUsage('openai',{usage:{input_tokens:4,output_tokens:2,total_tokens:9}}).status,'invalid');
  assert.equal(observeLlmUsage('ollama',{prompt_eval_count:2,prompt_eval_cached_count:3}).status,'invalid');
  assert.equal(observeLlmUsage('openai',{}).status,'not_reported');
  assert.equal(metric(observeLlmUsage('ollama',{prompt_eval_count:0,eval_count:0}),'input_tokens'),0);
  for(const n of [-1,0.5,Infinity,Number.MAX_SAFE_INTEGER+1,'12'])assert.equal(observeLlmUsage('ollama',{eval_count:n}).status,'invalid');
  assert.equal(JSON.stringify(observeLlmUsage('openai',{prompt:'secret',usage:{input_tokens:1}})).includes('secret'),false);
});
void test('actual adapters expose counters from responses without invoking paid providers',async()=>{
  const cases=[
    ['anthropic',{ANTHROPIC_API_KEY:'fixture'},{content:[{type:'text',text:'ok'}],usage:{input_tokens:2,output_tokens:3}},'uncached_input_tokens',2],
    ['google',{GOOGLE_GENERATIVE_AI_API_KEY:'fixture'},{candidates:[{content:{parts:[{text:'ok'}]}}],usageMetadata:{promptTokenCount:4,candidatesTokenCount:5}},'input_tokens',4],
    ['ollama',{}, {message:{content:'ok'},prompt_eval_count:6,eval_count:7},'output_tokens',7],
    ['openai-compatible',{SKY_LLM_COMPATIBLE_BASE_URL:'https://fixture.example'}, {choices:[{message:{content:'ok'}}],usage:{prompt_tokens:8,completion_tokens:9,total_tokens:17}},'input_tokens',8],
    ['local-model',{SKY_LOCAL_LLM_BASE_URL:'http://127.0.0.1:9000'}, {choices:[{message:{content:'ok'}}],usage:{prompt_tokens:10,completion_tokens:11}},'output_tokens',11],
  ];
  for(const [provider,env,payload,key,expected] of cases){
    if(provider==='anthropic')payload.stop_reason='end_turn';
    if(provider==='google')payload.candidates.forEach(c=>c.finishReason='STOP');
    if(provider==='ollama'){payload.done=true;payload.done_reason='stop';}
    if(payload.choices)payload.choices.forEach(c=>c.finish_reason='stop');
    const result=await generateText({provider,prompt:'fixture'},env,async()=>new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}}));
    assert.equal(result.text,'ok');assert.equal(metric(result.metering,key),expected);assert.equal(result.metering.invoiceVerified,false);
  }
});
void test('stored Agent receipts preserve non-token meters and reject mismatched scope or amount',()=>{
  const receipt={ownerUserId:'owner',parentJobId:'job',delegationId:'agent-run',providerId:'supplier',receiptId:'receipt',currency:'USD',amountMinor:25,pricingVersion:'v1',usage:[{meter:'gpu',unit:'seconds',quantity:10,amountMinor:25}]};
  const row={ownerUserId:'owner',parentJobId:'job',delegationId:'agent-run',providerId:'supplier',providerReference:'receipt',currency:'USD',amountMinor:25,receiptJson:JSON.stringify(receipt)};
  const result=observeStoredAgentUsage(row);assert.equal(result.metrics[0].unit,'seconds');assert.equal(result.amountMinor,25);assert.equal(result.developerPayment.status,'contract_not_bound');
  for(const patch of [{ownerUserId:'other'},{parentJobId:'other'},{amountMinor:26},{providerReference:'other'},{receiptJson:'invalid'}])assert.equal(observeStoredAgentUsage({...row,...patch}),null);
  assert.equal(observeStoredAgentUsage({...row,receiptJson:JSON.stringify({...receipt,usage:[{meter:'gpu',unit:'seconds',quantity:10,amountMinor:24}]})}),null);
});

void test('free service preserves reported details; saved legacy rows do not invent omitted counters or money',()=>{
 const input={model:'openai-fast',state:'completed',reportedModel:'reported-model',providerResponseId:'fixture-ref',inputTokens:10,outputTokens:4};
 const legacy=observeSavedFreeCloudUsage(input);assert.equal(metric(legacy,'input_tokens'),10);assert.equal(metric(legacy,'total_tokens'),null);assert.equal(metric(legacy,'cached_input_tokens'),null);assert.equal(legacy.amountMinor,null);assert.equal(legacy.invoiceVerified,false);
 const metering=observeLlmUsage('pollinations',{usage:{prompt_tokens:10,completion_tokens:4,total_tokens:14,prompt_tokens_details:{cached_tokens:2},completion_tokens_details:{reasoning_tokens:1}}});
 const reread=observeSavedFreeCloudUsage({...input,metering});assert.equal(metric(reread,'cached_input_tokens'),2);assert.equal(metric(reread,'reasoning_output_tokens'),1);assert.equal(metric(reread,'total_tokens'),14);assert.equal(reread.resourceId,'openai-fast');assert.equal(reread.reportedResourceId,'reported-model');assert.equal(observeSavedFreeCloudUsage({...input,state:'unconfirmed'}),null);
 for(const usage of [{prompt_tokens:1,completion_tokens:2,total_tokens:5},{prompt_tokens:1,prompt_tokens_details:{cached_tokens:2}},{completion_tokens:1,completion_tokens_details:{reasoning_tokens:2}}])assert.equal(observeLlmUsage('pollinations',{usage}).status,'invalid');
});
void test('display parsing rejects forged invoice/payment states and unsafe or duplicate metrics',()=>{
 const v=observeLlmUsage('openai',{usage:{input_tokens:0,output_tokens:0,total_tokens:0}});assert.deepEqual(readSkyUsageObservation(v),v);
 for(const patch of [{invoiceVerified:true},{developerPayment:{status:'paid',amountMinor:0}},{metrics:[v.metrics[0],v.metrics[0]]},{providerId:'bad\nprovider'},{metrics:[{meter:'input_tokens',unit:'tokens',quantity:-1,relationship:'independent'}]}])assert.equal(readSkyUsageObservation({...v,...patch}),null);
 const cleaned=readSkyUsageObservation({...v,prompt:'never retain this'});assert.equal('prompt' in cleaned,false);
});

void test('uncertain free results retain observed usage without becoming a payable completion',()=>{
 const metering=observeLlmUsage('pollinations',{id:'fixture-ref',model:'reported',usage:{prompt_tokens:2,completion_tokens:3,total_tokens:8}});
 assert.equal(metering.status,'invalid');
 const result=observeSavedFreeCloudUsage({state:'unconfirmed',model:'requested',metering:{...metering,amountMinor:999,currency:'USD',pricingVersion:'untrusted'}});
 assert.equal(result.status,'invalid');assert.equal(result.resourceId,'requested');assert.equal(metric(result,'total_tokens'),8);
 assert.equal(result.amountMinor,null);assert.equal(result.currency,null);assert.equal(result.pricingVersion,null);assert.equal(result.invoiceVerified,false);
 assert.equal(observeSavedFreeCloudUsage({state:'sending',model:'requested',metering}),null);
 assert.equal(observeSavedFreeCloudUsage({state:'unconfirmed',model:'requested',metering:{...metering,source:'agent',basis:'stored_verified_receipt'}}),null);
});
