import { WorkError } from './workflow.ts';
type DB = Pick<D1Database,'prepare'|'batch'>;
export type CloudMonthlySource = { kind: 'a2a'|'remote_llm'; id: string; owner: string; provider: string; reference: string; amount: number; currency: string; pricingVersion: string; usage: unknown; at: number; digest: string };
async function digest(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
/** Only finalized usage already accepted by the existing execution/settlement stores; never request-body amounts. */
export async function cloudMonthlySource(db: DB, owner: string, kind: string, id: string): Promise<CloudMonthlySource> {
  let source: Omit<CloudMonthlySource,'digest'>;
  if(kind==='remote_llm') {
    const row=await db.prepare(`SELECT e.* FROM remote_ai_text_executions e JOIN agent_delegation_budget_pools p
      ON p.owner_user_id=e.owner_user_id AND p.parent_job_id=e.parent_job_id AND p.currency=e.currency
      WHERE e.id=? AND e.owner_user_id=? AND e.state='completed' AND e.settled_minor IS NOT NULL`).bind(id,owner).first<Record<string,unknown>>();
    if(!row) throw new WorkError('確定済みCloud使用量が見つかりません。',404);
    const price=JSON.parse(String(row.price_json)) as Record<string,unknown>;
    const usage=JSON.parse(String(row.usage_json)) as unknown;
    if(price.status!=='priced'||price.chargeMinor!==row.settled_minor||price.currency!==row.currency||price.providerResponseId!==row.provider_response_id||price.rateCardDigest!==row.rate_card_digest)
      throw new WorkError('Cloud使用量の照合が一致しません。',409);
    source={kind,id,owner,provider:'openai',reference:String(row.provider_response_id),amount:Number(row.settled_minor),currency:String(row.currency),pricingVersion:String(price.pricingVersion),usage,at:Number(row.updated_at)};
  } else if(kind==='a2a') {
    const row=await db.prepare(`SELECT r.* FROM a2a_usage_receipts r JOIN agent_delegation_budget_reservations b ON b.delegation_id=r.delegation_id
      AND b.owner_user_id=r.owner_user_id AND b.parent_job_id=r.parent_job_id AND b.currency=r.currency
      AND b.state='settled' AND b.settled_minor=r.amount_minor WHERE r.delegation_id=? AND r.owner_user_id=?`).bind(id,owner).first<Record<string,unknown>>();
    if(!row) throw new WorkError('精算済みAgent使用量が見つかりません。',404);
    const receipt=JSON.parse(String(row.receipt_json)) as Record<string,unknown>;
    if(receipt.schema!=='rock-a2a-provider-usage-receipt/1'||receipt.delegationId!==id||receipt.ownerUserId!==owner||receipt.providerId!==row.provider_id||receipt.receiptId!==row.provider_reference||receipt.amountMinor!==row.amount_minor||receipt.currency!==row.currency||typeof receipt.signature!=='string'||receipt.signature.length!==86)
      throw new WorkError('Agent使用量の照合が一致しません。',409);
    source={kind,id,owner,provider:String(row.provider_id),reference:String(row.provider_reference),amount:Number(row.amount_minor),currency:String(row.currency),pricingVersion:String(receipt.pricingVersion),usage:receipt.usage,at:Number(row.issued_at)};
  } else throw new WorkError('使用量の種類を確認してください。');
  if(!Number.isSafeInteger(source.amount)||source.amount<0||source.amount>1000000||!['USD','JPY'].includes(source.currency)||!source.reference||source.reference==='null'||!Number.isSafeInteger(source.at)||source.at<0||source.at>Date.now()+30000)
    throw new WorkError('請求可能な使用量ではありません。',409);
  return {...source,digest:await digest(source)};
}
