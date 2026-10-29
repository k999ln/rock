import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { A2A_PRICE_QUOTE_SCHEMA, a2aPriceQuoteSigningBytes } from '../../../lib/a2a-price-quote.ts';
import { A2A_BROKER_AUTHORIZATION_SCHEMA, a2aBrokerAuthorizationSigningBytes } from '../../../lib/a2a-broker-authorization.ts';
import { discoverA2AAgent } from '../../../lib/a2a-agent-directory.ts';
import { a2aUsageReceiptSigningBytes } from '../../../lib/a2a-usage-receipt.ts';

export function syntheticA2A(owner) {
  const broker=generateKeyPairSync('ed25519'), provider=generateKeyPairSync('ed25519');
  const origin='https://a2a.example.com', extension='https://rockstar.example/extensions/a2a-price-quote/v1';
  const card={name:'合成Agent',description:'Synthetic test-only remote',version:'1.0.0',
    supportedInterfaces:[{url:`${origin}/rpc`,protocolBinding:'JSONRPC',protocolVersion:'1.0'}],
    capabilities:{extensions:[{uri:extension,required:false}]}};
  const hex=key=>key.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const env={A2A_DELEGATION_EXECUTION_ENABLED:'true',A2A_PRICE_QUOTES_REQUIRED:'true',A2A_EGRESS_ALLOWED_ORIGINS:origin,
    A2A_PRICE_QUOTE_EXTENSION_URI:extension,A2A_INPUT_ENCRYPTION_KEY:'b'.repeat(64),
    A2A_TRUSTED_BROKER_KEYS:JSON.stringify([{authorityId:'fixture-authority',ownerUserId:owner,deviceRef:'fixture-device',keyId:'fixture-broker',publicKeyHex:hex(broker),status:'active'}]),
    A2A_TRUSTED_USAGE_KEYS:JSON.stringify([{providerId:'fixture-provider',keyId:'fixture-provider-key',agentOrigin:origin,publicKeyHex:hex(provider),status:'active'}])};
  const discover=()=>discoverA2AAgent(origin,async()=>Response.json(card));
  const quoteFetch=async (url,init)=>{
    if(new URL(url).origin!==origin)throw Error('Unexpected synthetic origin');
    const rpc=JSON.parse(init.body);if(rpc.method!=='GetPriceQuote'||rpc.params.executionRequested!==false)throw Error('Unexpected synthetic request');
    const text=rpc.params.message.parts[0].text, now=Date.now(), maximum=rpc.params.maximumBudgetMinor;
    const quote={schema:A2A_PRICE_QUOTE_SCHEMA,providerId:'fixture-provider',keyId:'fixture-provider-key',quoteId:'fixture-quote-1',
      agentOrigin:origin,agentName:card.name,agentVersion:card.version,requestSha256:createHash('sha256').update(text).digest('hex'),
      pricingVersion:'fixture-rates-1',pricingSha256:'c'.repeat(64),currency:rpc.params.currency,estimateMinor:11,maxAmountMinor:maximum,
      issuedAt:now,expiresAt:now+60000,usage:[{meter:'task',quantity:1,unit:'request',unitPriceMinor:11,amountMinor:11}],signature:''};
    quote.signature=sign(null,a2aPriceQuoteSigningBytes(quote),provider.privateKey).toString('base64url');
    return Response.json({jsonrpc:'2.0',id:rpc.id,result:{schema:'rock-a2a-price-quote-response/1',quoteRequestId:rpc.params.quoteRequestId,priceQuote:quote}});
  };
  const proof=delegation=>{
    const now=Date.now(), result={schema:A2A_BROKER_AUTHORIZATION_SCHEMA,authorityId:'fixture-authority',ownerUserId:owner,
      deviceRef:'fixture-device',delegationId:delegation.id,parentJobId:delegation.parentJobId,messageId:delegation.messageId,
      targetOrigin:delegation.targetOrigin,targetAgentName:delegation.targetAgentName,targetAgentVersion:delegation.targetAgentVersion,
      protocolVersion:delegation.protocolVersion,inputSha256:delegation.inputSha256,budgetCurrency:delegation.budgetCurrency,
      budgetLimitMinor:delegation.budgetLimitMinor,continueWhileDeviceOffline:delegation.continueWhileDeviceOffline,
      deadlineAt:delegation.deadlineAt,authorizationSha256:delegation.authorizationSha256,issuedAt:now,expiresAt:now+60000,keyId:'fixture-broker',signature:''};
    result.signature=sign(null,a2aBrokerAuthorizationSigningBytes(result),broker.privateKey).toString('base64url');return result;
  };
  let approved=null, remoteTask=null, sends=0, cancels=0, reads=0;
  const bindDelegation=delegation=>{if(approved)throw Error('fixture already bound');approved=delegation;};
  const remoteFetch=async request=>{
    const url=new URL(request.url);if(url.origin!==origin)throw Error('Unexpected synthetic origin');
    if(request.method==='GET' && url.pathname==='/.well-known/agent-card.json')return Response.json(card);
    if(request.method!=='POST'||url.pathname!=='/rpc'||!approved)throw Error('Unexpected synthetic request');
    const rpc=await request.json();
    if(rpc.method==='SendMessage'){
      if(++sends!==1||rpc.params?.message?.messageId!==approved.messageId)throw Error('Unexpected repeated send');
      remoteTask=`synthetic-task-${randomUUID()}`;
      return Response.json({jsonrpc:'2.0',id:rpc.id,result:{task:{id:remoteTask,status:{state:'TASK_STATE_WORKING'}}}});
    }
    if(rpc.params?.id!==remoteTask||!remoteTask)throw Error('Unknown synthetic task');
    if(rpc.method==='CancelTask'){
      if(++cancels!==1)throw Error('Unexpected repeated cancel');
      throw Error('Synthetic remote cancel committed but response was lost');
    }
    if(rpc.method==='GetTask'&&cancels===1){
      reads++;const receipt={schema:'rock-a2a-provider-usage-receipt/1',providerId:'fixture-provider',keyId:'fixture-provider-key',
        receiptId:'synthetic-receipt-1',ownerUserId:owner,parentJobId:approved.parentJobId,delegationId:approved.id,taskId:remoteTask,
        agentOrigin:origin,agentName:card.name,agentVersion:card.version,currency:approved.budgetCurrency,amountMinor:11,
        pricingVersion:'fixture-rates-1',issuedAt:Date.now(),usage:[{meter:'task',quantity:1,unit:'request',amountMinor:11}],signature:''};
      receipt.signature=sign(null,a2aUsageReceiptSigningBytes(receipt),provider.privateKey).toString('base64url');
      if(reads===1)receipt.signature='x'.repeat(86);
      return Response.json({jsonrpc:'2.0',id:rpc.id,result:{id:remoteTask,status:{state:'TASK_STATE_CANCELED'},metadata:{'org.rockstar.usageReceipt':receipt}}});
    }
    throw Error('Unexpected synthetic method');
  };
  return {env,discover,quoteFetch,proof,bindDelegation,remoteFetch,remoteState:()=>({remoteTask,sends,cancels,reads})};
}
