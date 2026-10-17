// Explicit synthetic usage, through the existing signed-price/budget/execution lifecycle. No cloud API request.
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA, remoteAiRateCardSigningBytes, verifyRemoteAiRateCard } from '../lib/remote-ai-rate-card.ts';
import { RemoteAiRateCardStore } from '../lib/remote-ai-rate-card-store.ts';
import { prepareRemoteAiTextQuote } from '../lib/remote-ai-text-pricing.ts';
import { RemoteAiTextStore } from '../lib/remote-ai-text-store.ts';
import { encryptRemoteAiTextInput } from '../lib/remote-ai-text-input.ts';
import { workStore } from '../lib/work-store.ts';
import { createWorkJob } from '../lib/workflow.ts';
export async function seedMonthlyCloudFixture(db,owner='local-cloud-test-owner',options={}){
 const now=options.now??Date.now(); const pair=generateKeyPairSync('ed25519');
 const publicBytes=Uint8Array.from(pair.publicKey.export({format:'der',type:'spki'}).subarray(-32));
 const suffix=randomUUID();
 const card={schema:REMOTE_AI_TEXT_RATE_CARD_SCHEMA,providerId:'openai',keyId:`fixture-${suffix}`,cardId:`fixture-${suffix}`,modelId:'fixture-model',pricingVersion:'fixture-monthly-v1',currency:'USD',inputMinorMicrosPerMillionTokens:1000000000000,outputMinorMicrosPerMillionTokens:1000000000000,cachedInputMinorMicrosPerMillionTokens:1000000000000,cacheWriteMinorMicrosPerMillionTokens:1000000000000,executionScope:'text-only',serviceTier:'default',effectiveAt:now-1000,expiresAt:now+600000,sourceUrl:'https://developers.openai.com/api/docs/pricing',signature:''};
 card.signature=sign(null,remoteAiRateCardSigningBytes(card),pair.privateKey).toString('base64url');
 const verified=await verifyRemoteAiRateCard(card,{providerId:'openai',modelId:card.modelId,currency:'USD'},async()=>publicBytes,now);
 if(!verified)throw new Error('Fixture rate invalid');
 await new RemoteAiRateCardStore(db).register(verified,'synthetic-test-operator',now);
 const parent=createWorkJob({id:randomUUID(),templateId:'article',title:'Synthetic monthly billing test'});
 await workStore(db).create(owner,parent);
 const intent={ownerId:owner,requestId:randomUUID(),model:card.modelId,prompt:'Synthetic cloud usage, not a live model request.',maxOutputTokens:100,maximumBudgetMinor:1000};
 const quote=await prepareRemoteAiTextQuote(verified,intent,now);if(!quote)throw new Error('Fixture quote invalid');
 const store=new RemoteAiTextStore(db);const record=(await store.create(quote,verified,parent.id,1000,false,now)).record;
 if(options.stage==='quoted')return {id:record.id,approval:record.approvalDigest,store};
 await store.reserve(owner,record.id,record.approvalDigest,now);
 await store.saveInput(owner,record.id,record.approvalDigest,await encryptRemoteAiTextInput(intent,'a'.repeat(64),owner,record.id),now);
 if(options.stage==='reserved')return {id:record.id,approval:record.approvalDigest,store};
 if(!await store.claimDispatch(owner,record.id,record.approvalDigest,now))throw new Error('Fixture dispatch denied');
 if(options.stage==='sending')return {id:record.id,approval:record.approvalDigest,store};
 await store.claimProviderSend(owner,record.id,now);
 const result=await store.complete(owner,record.id,verified,{provider:'openai',model:card.modelId,text:'Synthetic output',durationMs:1,providerResponseId:`resp_fixture_${suffix}`,reportedModel:card.modelId,serviceTier:'default',responseStatus:'completed',textOnlyOutput:true,webSearchCalls:0,usage:{inputTokens:1,outputTokens:99,totalTokens:100,cachedInputTokens:0,cacheWriteInputTokens:0}},now);
 if(result.state!=='completed')throw new Error(`Fixture incomplete: ${result.errorCode}`);
 return {id:result.id,kind:'remote_llm',amount:result.settledMinor,currency:'USD',synthetic:true};
}
