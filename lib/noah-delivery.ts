import { noahSha256, NoahAgentError, noahUploadId } from './noah-agent-upload.ts';
import { canonicalOperationValue } from './noah-operation-contract.mjs';

export type NoahDeliveryTarget = { id:string; label:string; endpoint:string; revision:string; pricing:'free'; test:boolean; token:string };
export type NoahDeliveryDestination = Omit<NoahDeliveryTarget,'token'>;
export type NoahDeliveryPayload = { recipient:string; agent:{name:string;version:string;summary?:string;author?:string;license?:string;priceNote?:string}; body:string };
export type NoahDeliveryReceipt = { schema:'noah-delivery-receipt/1'; id:string; payloadSha256:string; status:'accepted'|'rejected'; receiptId:string; receivedAt:number };
export const deliveryDigest = (value:unknown) => noahSha256(new TextEncoder().encode(canonicalOperationValue(value)));
export const deliveryDestination = ({token: _token,...target}:NoahDeliveryTarget):NoahDeliveryDestination => target;
const exact = (v:unknown,keys:string[]) => v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).every(k=>keys.includes(k));
export function parseDeliveryPayload(input:unknown):NoahDeliveryPayload {
  const v=input as NoahDeliveryPayload;
  if(!exact(v,['recipient','agent','body'])||typeof v.recipient!=='string'||!v.recipient.trim()||v.recipient.length>200||Array.from(v.recipient).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||typeof v.body!=='string'||v.body.length>4000||!exact(v.agent,['name','version','summary','author','license','priceNote'])||typeof v.agent.name!=='string'||!v.agent.name||typeof v.agent.version!=='string'||!v.agent.version||Object.values(v.agent).some(x=>typeof x!=='string'||x.length>2000))throw new NoahAgentError('宛先・送信項目・本文を確認してください。');
  if(new TextEncoder().encode(JSON.stringify(v)).length>20000)throw new NoahAgentError('送信内容はUTF-8で20KBまでです。項目か本文を減らしてください。',413);
  return structuredClone(v);
}
export function deliveryTargets(bindings:Record<string,unknown>,owner:string,requestUrl:string):NoahDeliveryTarget[] {
  const result:NoahDeliveryTarget[]=[];
  if(bindings.NOAH_DELIVERY_TARGETS!==undefined){
    if(typeof bindings.NOAH_DELIVERY_TARGETS!=='string'||bindings.NOAH_DELIVERY_TARGETS.length>32768)throw new NoahAgentError('送信先の設定を確認できません。',503);
    let targets:unknown;try{targets=JSON.parse(bindings.NOAH_DELIVERY_TARGETS);}catch{throw new NoahAgentError('送信先の設定を確認できません。',503);}
    if(!Array.isArray(targets)||targets.length>32)throw new NoahAgentError('送信先の設定を確認できません。',503);
    for(const raw of targets){
      if(!exact(raw,['id','label','endpoint','revision','pricing','credentialEnv','owners'])||!raw||typeof raw!=='object')throw new NoahAgentError('送信先の設定を確認できません。',503);
      const v=raw as Record<string,unknown>;
      if(!Array.isArray(v.owners)||!v.owners.every(x=>typeof x==='string'))throw new NoahAgentError('送信先の許可先を確認できません。',503);
      if(!v.owners.includes(owner))continue;
      if(typeof v.id!=='string'||!/^[-a-z0-9]{1,64}$/.test(v.id)||v.id==='local-test'||typeof v.label!=='string'||!v.label||v.label.length>120||typeof v.revision!=='string'||!v.revision||v.revision.length>80||typeof v.endpoint!=='string'||typeof v.credentialEnv!=='string'||!/^NOAH_[A-Z0-9_]{1,80}$/.test(v.credentialEnv))throw new NoahAgentError('送信先の設定を確認できません。',503);
      // Unknown or paid adapters remain closed until the existing Wallet gate is integrated.
      if(v.pricing!=='free')continue;
      let url:URL;try{url=new URL(v.endpoint);}catch{throw new NoahAgentError('送信先の設定を確認できません。',503);}
      if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.hostname==='localhost'||url.hostname.endsWith('.localhost')||/^[\d.]+$/.test(url.hostname)||url.hostname.includes(':'))throw new NoahAgentError('送信先は設定済みのHTTPSに限定します。',503);
      const token=bindings[v.credentialEnv];if(typeof token!=='string'||token.length<16||token.length>4096||/[\r\n]/.test(token))continue;
      result.push({id:v.id,label:v.label,endpoint:url.href.replace(/\/$/,''),revision:v.revision,pricing:'free',test:false,token});
    }
  }
  if(['127.0.0.1','localhost','[::1]'].includes(new URL(requestUrl).hostname)&&bindings.ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID===owner&&owner==='local-preview:rockstar-owner')result.push({id:'local-test',label:'このMacの試験用受信箱（外部送信なし）',endpoint:'http://127.0.0.1:3110',revision:'noah-local-inbox/1',pricing:'free',test:true,token:'noah-local-test-receiver-v1'});
  if(new Set(result.map(t=>t.id)).size!==result.length)throw new NoahAgentError('送信先IDが重複しています。',503);
  return result;
}
async function responseBody(response:Response){
  const reader=response.body?.getReader();if(!reader)throw Error('empty');const chunks:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>8192){await reader.cancel();throw Error('large');}chunks.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export function parseDeliveryReceipt(value:unknown,id:string,payloadSha256:string):NoahDeliveryReceipt {
  const v=value as NoahDeliveryReceipt;
  if(!exact(v,['schema','id','payloadSha256','status','receiptId','receivedAt'])||v.schema!=='noah-delivery-receipt/1'||v.id!==id||v.payloadSha256!==payloadSha256||!['accepted','rejected'].includes(v.status)||typeof v.receiptId!=='string'||!/^[-a-zA-Z0-9_:]{1,120}$/.test(v.receiptId)||!Number.isSafeInteger(v.receivedAt)||v.receivedAt<=0)throw Error('unconfirmed receipt');
  return v;
}
export async function contactDeliveryTarget(target:NoahDeliveryTarget,attempt:{id:string;payloadSha256:string},payload:NoahDeliveryPayload|null,fetcher:typeof fetch=fetch):Promise<NoahDeliveryReceipt|null>{
  noahUploadId(attempt.id);
  try{
    const response=await fetcher(`${target.endpoint}/deliveries/${attempt.id}`,{method:payload?'POST':'GET',redirect:'manual',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${target.token}`,Accept:'application/json',...(payload?{'Content-Type':'application/json','Idempotency-Key':attempt.id}:{})},...(payload?{body:JSON.stringify({schema:'noah-delivery/1',id:attempt.id,payloadSha256:attempt.payloadSha256,payload})}:{})});
    if(!response.ok){await response.body?.cancel();return null;}
    return parseDeliveryReceipt(await responseBody(response),attempt.id,attempt.payloadSha256);
  }catch{return null;}
}
