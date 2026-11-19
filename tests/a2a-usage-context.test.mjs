import test from 'node:test';
import assert from 'node:assert/strict';
import { createA2AClient } from '../lib/a2a-client.ts';
import { createA2AUsageContext, A2A_USAGE_CONTEXT_EXTENSION_URI as uri, A2A_USAGE_CONTEXT_METADATA as metadataKey } from '../lib/a2a-usage-context.ts';
async function fixture() {
  const message='Normal synthetic request without internal IDs.', messageId='fixture-message';
  const hash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message))).toString('hex');
  const context=createA2AUsageContext({id:'fixture-delegation',ownerUserId:'synthetic-owner',parentJobId:'fixture-parent',messageId,inputSha256:hash,authorizationSha256:'a'.repeat(64),budgetCurrency:'USD',budgetLimitMinor:1,deadlineAt:Date.now()+60000,priceQuote:{pricingVersion:'fixture-rate-1'},ciphertext:'must-not-be-shared',proofJson:'must-not-be-shared'});
  const card={name:'fixture-agent',description:'Synthetic Agent Card',version:'1.0.0',supportedInterfaces:[{url:'https://agent.example.com/rpc',protocolBinding:'JSONRPC',protocolVersion:'1.0'}],capabilities:{extensions:[{uri,required:false}]}};
  let sent,headers,calls=0,authorized=0;
  const options={allowedOrigins:['https://agent.example.com'],usageContextExtensionUri:uri,usageContext:context,authorizeDelegation:async()=>{authorized++},fetch:async(_url,init)=>{calls++;sent=JSON.parse(init.body);headers=new Headers(init.headers);return Response.json({jsonrpc:'2.0',id:sent.id,result:{task:{id:'remote-task',status:{state:'TASK_STATE_COMPLETED'}}}})}};
  return {message,messageId,card,context,options,state:()=>({sent,headers,calls,authorized})};
}
void test('negotiated usage metadata preserves the exact owner text and sends only approved correlation fields after authorization',async()=>{
  const f=await fixture(); await createA2AClient(f.options).sendMessage(f.card,f.messageId,f.message);
  const {sent,headers,calls,authorized}=f.state(); assert.equal(calls,1);assert.equal(authorized,1);
  assert.equal(sent.params.message.parts[0].text,f.message);
  assert.deepEqual(sent.params.message.metadata[metadataKey],f.context);
  assert.equal(headers.get('A2A-Extensions'),uri); assert.deepEqual(sent.params.message.extensions,[uri]);
  assert.ok(!JSON.stringify(sent).includes('must-not-be-shared'));
});
void test('unsupported or unconfigured extension, changed IDs/hash, expired context and extra secret fields fail before any send',async()=>{
  for(const change of ['unsupported','unconfigured','id','hash','expiry','secret']) {
    const f=await fixture();
    if(change==='unsupported')f.card.capabilities.extensions=[];
    if(change==='unconfigured')delete f.options.usageContextExtensionUri;
    if(change==='id')f.context.messageId='other-message';
    if(change==='hash')f.context.inputSha256='b'.repeat(64);
    if(change==='expiry')f.context.deadlineAt=1;
    if(change==='secret')f.context.secret='do-not-send';
    await assert.rejects(createA2AClient(f.options).sendMessage(f.card,f.messageId,f.message),e => ['unsupported','unconfigured'].includes(change) ? e.code === 'a2a_usage_context_unsupported' : e.message === 'A2A_USAGE_CONTEXT_INVALID');
    assert.equal(f.state().calls,0);assert.equal(f.state().authorized,0);
  }
});
void test('a rejected authorization never sends correlation data and mutation during authorization cannot expand the serialized context',async()=>{
  const denied=await fixture();denied.options.authorizeDelegation=async()=>{throw new Error('revoked')};
  await assert.rejects(createA2AClient(denied.options).sendMessage(denied.card,denied.messageId,denied.message));assert.equal(denied.state().calls,0);
  const f=await fixture();f.options.authorizeDelegation=async()=>{f.context.secret='must-not-leak';f.context.ownerUserId='other-owner'};
  await createA2AClient(f.options).sendMessage(f.card,f.messageId,f.message);
  const sent=f.state().sent.params.message.metadata[metadataKey];assert.equal(sent.ownerUserId,'synthetic-owner');assert.equal(sent.secret,undefined);
});
void test('existing clients without an enabled usage context retain their original wire payload',async()=>{
  const f=await fixture();delete f.options.usageContext;delete f.options.usageContextExtensionUri;
  await createA2AClient(f.options).sendMessage(f.card,f.messageId,f.message);
  const message=f.state().sent.params.message;assert.equal(message.metadata,undefined);assert.equal(message.extensions,undefined);
});
