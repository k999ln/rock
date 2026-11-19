import type { TextModelProviderId } from './llm-providers.ts';
import type { A2AUsageReceiptRecord } from './a2a-delegation-store.ts';

export type SkyUsageObservation = {
  schema: 'sky-usage-observation/1';
  source: 'llm' | 'agent';
  providerId: string;
  resourceId: string | null;
  reportedResourceId: string | null;
  basis: 'provider_response' | 'stored_verified_receipt';
  status: 'reported' | 'partial' | 'not_reported' | 'invalid';
  metrics: Array<{ meter: string; unit: string; quantity: number | null; relationship: 'independent' | 'subset' | 'total'; amountMinor?: number }>;
  currency: string | null;
  amountMinor: number | null;
  pricingVersion: string | null;
  providerReference: string | null;
  invoiceVerified: false;
  developerPayment: { status: 'contract_not_bound'; amountMinor: null };
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
type Field = [string, string, 'independent' | 'subset' | 'total'];
const chatFields: Field[] = [['input_tokens','prompt_tokens','independent'],['output_tokens','completion_tokens','independent'],['total_tokens','total_tokens','total'],['cached_input_tokens','prompt_tokens_details.cached_tokens','subset'],['reasoning_output_tokens','completion_tokens_details.reasoning_tokens','subset']];
const fields: Partial<Record<TextModelProviderId, Field[]>> = {
  'openai-compatible': chatFields, 'local-model': chatFields, pollinations: chatFields,
  openai: [['input_tokens','input_tokens','independent'],['output_tokens','output_tokens','independent'],['total_tokens','total_tokens','total'],['cached_input_tokens','input_tokens_details.cached_tokens','subset'],['reasoning_output_tokens','output_tokens_details.reasoning_tokens','subset']],
  anthropic: [['uncached_input_tokens','input_tokens','independent'],['output_tokens','output_tokens','independent'],['cache_read_input_tokens','cache_read_input_tokens','independent'],['cache_write_input_tokens','cache_creation_input_tokens','independent']],
  google: [['input_tokens','promptTokenCount','independent'],['candidate_output_tokens','candidatesTokenCount','independent'],['reasoning_output_tokens','thoughtsTokenCount','independent'],['tool_prompt_tokens','toolUsePromptTokenCount','independent'],['cached_input_tokens','cachedContentTokenCount','subset'],['total_tokens','totalTokenCount','total']],
  ollama: [['input_tokens','prompt_eval_count','independent'],['output_tokens','eval_count','independent'],['cached_input_tokens','prompt_eval_cached_count','subset']],
};
/** Display observations only. Missing counters are unknown, never zero or a payable invoice. */
export function observeLlmUsage(provider: TextModelProviderId, payload: unknown): SkyUsageObservation {
  const body = record(payload);
  const usage = provider === 'ollama' ? body : record(provider === 'google' ? body.usageMetadata : body.usage);
  let invalid = false;
  const metrics = (fields[provider] ?? []).map(([meter,path,relationship]) => {
    const value = path.split('.').reduce<unknown>((part,key) => record(part)[key], usage);
    if (value !== undefined && value !== null && !count(value)) invalid = true;
    return {meter,unit:'tokens',quantity:count(value)?value:null,relationship};
  });
  const quantity = (meter:string) => metrics.find(item=>item.meter===meter)?.quantity;
  const input=quantity('input_tokens'),output=quantity('output_tokens'),total=quantity('total_tokens'),cached=quantity('cached_input_tokens');
  if(typeof cached==='number' && typeof input==='number' && cached>input)invalid=true;
  if(['openai','openai-compatible','local-model','pollinations'].includes(provider) && typeof input==='number' && typeof output==='number' && typeof total==='number' && (!Number.isSafeInteger(input+output)||input+output!==total))invalid=true;
  const reasoning=quantity('reasoning_output_tokens');
  if(['openai','openai-compatible','local-model','pollinations'].includes(provider) && typeof reasoning==='number' && typeof output==='number' && reasoning>output)invalid=true;
  const reported = metrics.filter(item=>item.quantity !== null).length;
  return {schema:'sky-usage-observation/1',source:'llm',providerId:provider,resourceId:null,reportedResourceId:typeof body.model==='string'&&body.model.length<=256?body.model:null,basis:'provider_response',
    status:invalid?'invalid':reported===0?'not_reported':reported===metrics.length?'reported':'partial',metrics,
    currency:null,amountMinor:null,pricingVersion:null,providerReference:typeof (body.id??body.responseId)==='string' && /^[A-Za-z0-9._:-]{1,256}$/.test(String(body.id??body.responseId)) ? String(body.id??body.responseId) : null,invoiceVerified:false,
    developerPayment:{status:'contract_not_bound',amountMinor:null}};
}
/** Called only on owner-scoped rows from the existing signature-verified A2A receipt store. */
export function observeStoredAgentUsage(row: A2AUsageReceiptRecord): SkyUsageObservation | null {
  try {
    const receipt = record(JSON.parse(row.receiptJson));
    if (receipt.ownerUserId!==row.ownerUserId || receipt.parentJobId!==row.parentJobId || receipt.delegationId!==row.delegationId ||
      receipt.providerId!==row.providerId || receipt.receiptId!==row.providerReference || receipt.amountMinor!==row.amountMinor ||
      receipt.currency!==row.currency || !count(row.amountMinor) || !/^[A-Z]{3}$/.test(row.currency) ||
      typeof receipt.pricingVersion!=='string' || !Array.isArray(receipt.usage) || !receipt.usage.length) return null;
    let total=0;
    const metrics: SkyUsageObservation['metrics'] = receipt.usage.map(value=>{
      const line=record(value);
      if(typeof line.meter!=='string'||typeof line.unit!=='string'||!count(line.quantity)||!count(line.amountMinor))throw new Error('INVALID_METER');
      total+=line.amountMinor;
      if(!Number.isSafeInteger(total))throw new Error('OVERFLOW');
      return {meter:line.meter,unit:line.unit,quantity:line.quantity,amountMinor:line.amountMinor,relationship:'independent'};
    });
    if(total!==row.amountMinor)return null;
    return {schema:'sky-usage-observation/1',source:'agent',providerId:row.providerId,resourceId:typeof receipt.agentName==='string'?receipt.agentName:null,reportedResourceId:typeof receipt.agentVersion==='string'?receipt.agentVersion:null,basis:'stored_verified_receipt',status:'reported',metrics,
      currency:row.currency,amountMinor:row.amountMinor,pricingVersion:receipt.pricingVersion,providerReference:row.providerReference,
      invoiceVerified:false,developerPayment:{status:'contract_not_bound',amountMinor:null}};
  } catch { return null; }
}

/** Re-project only retained counters, never infer omitted totals or trust stored money. */
export function observeSavedFreeCloudUsage(value: {state:string;model:string;reportedModel?:string;providerResponseId?:string;inputTokens?:number;outputTokens?:number;metering?:SkyUsageObservation}): SkyUsageObservation | null {
  const snapshot=readSkyUsageObservation(value.metering);
  if(value.state!=='completed') {
    if(value.state!=='unconfirmed'||!snapshot||snapshot.source!=='llm'||snapshot.providerId!=='pollinations'||snapshot.basis!=='provider_response')return null;
    return {...snapshot,resourceId:value.model,currency:null,amountMinor:null,pricingVersion:null,invoiceVerified:false as const,developerPayment:{status:'contract_not_bound' as const,amountMinor:null}};
  }
  const retained=(meter:string)=>snapshot?.metrics.find(item=>item.meter===meter)?.quantity;
  return {...observeLlmUsage('pollinations',{id:value.providerResponseId,model:value.reportedModel,usage:{
    prompt_tokens:value.inputTokens,completion_tokens:value.outputTokens,total_tokens:retained('total_tokens'),
    prompt_tokens_details:{cached_tokens:retained('cached_input_tokens')},
    completion_tokens_details:{reasoning_tokens:retained('reasoning_output_tokens')},
  }}),resourceId:value.model};
}

/** Narrow a display-only observation. Never authorizes spending or Tool success. */
export function readSkyUsageObservation(value: unknown): SkyUsageObservation | null {
 const v=record(value),text=(x:unknown)=>typeof x==='string'&&x.length>0&&x.length<=256&&Array.from(x).every(c=>{const code=c.charCodeAt(0);return code>=32&&code!==127;}),nullableText=(x:unknown)=>x===null||text(x);
 if(v.schema!=='sky-usage-observation/1'||!['llm','agent'].includes(String(v.source))||!text(v.providerId)||
  !nullableText(v.resourceId)||!nullableText(v.reportedResourceId)||!['provider_response','stored_verified_receipt'].includes(String(v.basis))||
  !['reported','partial','not_reported','invalid'].includes(String(v.status))||v.invoiceVerified!==false||
  !(v.currency===null||(typeof v.currency==='string'&&/^[A-Z]{3}$/.test(v.currency)))||!(v.amountMinor===null||count(v.amountMinor))||
  !nullableText(v.pricingVersion)||!nullableText(v.providerReference)||!Array.isArray(v.metrics)||v.metrics.length>32||
  record(v.developerPayment).status!=='contract_not_bound'||record(v.developerPayment).amountMinor!==null)return null;
 const seen=new Set<string>();
 for(const raw of v.metrics){const line=record(raw);if(!text(line.meter)||!text(line.unit)||!['independent','subset','total'].includes(String(line.relationship))||
  !(line.quantity===null||count(line.quantity))||(line.amountMinor!==undefined&&!count(line.amountMinor))||seen.has(String(line.meter)))return null;seen.add(String(line.meter));}
 return {schema:v.schema,source:v.source,providerId:v.providerId,resourceId:v.resourceId,reportedResourceId:v.reportedResourceId,basis:v.basis,status:v.status,
  metrics:v.metrics.map(raw=>{const line=record(raw);return {meter:line.meter,unit:line.unit,quantity:line.quantity,relationship:line.relationship,...(line.amountMinor===undefined?{}:{amountMinor:line.amountMinor})};}),
  currency:v.currency,amountMinor:v.amountMinor,pricingVersion:v.pricingVersion,providerReference:v.providerReference,invoiceVerified:false,
  developerPayment:{status:'contract_not_bound',amountMinor:null}} as SkyUsageObservation;
}
