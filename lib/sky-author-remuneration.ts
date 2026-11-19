import { a2aDelegationStore } from './a2a-delegation-store.ts';
import { a2aPriceQuoteDigest } from './a2a-price-quote.ts';
import { observeStoredAgentUsage } from './sky-usage-observation.ts';
import { marketplaceCommissionMinor, SKY_MARKETPLACE_COMMISSION_BPS } from './sky-marketplace-policy.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { WorkError } from './workflow.ts';
import type { CapturedAgentUsageSource } from './sky-agent-usage-provenance.ts';
import type { LinuxInvoice } from './sky-linux-service.ts';

export { parseAuthorRemunerationTerms } from './sky-author-remuneration-terms.ts';
import { parseAuthorRemunerationTerms } from './sky-author-remuneration-terms.ts';
export type AuthorAllocationCandidate = {
 schema:'sky.author-allocation-candidate/1';id:string;status:'pending_invoice_and_collection';
 delegationId:string;receiptSha256:string;agreementSha256:string;quoteDigest:string;currency:string;
 receiptTotalMinor:number;otherUsageMinor:number;authorMeter:string;authorUnit:string;
 allocation:LinuxInvoice['allocations'][number];preparedAt:string;
};
/** This candidate uses only the contract-designated fee line. It cannot create
 * an invoice, confirm collection, or issue an existing billing transfer. */
export async function prepareAuthorAllocation(db:Pick<D1Database,'prepare'|'batch'>,owner:string,parentJobId:string,source:CapturedAgentUsageSource,termsText:string):Promise<AuthorAllocationCandidate> {
 const terms=parseAuthorRemunerationTerms(termsText),bound=source.authorAgreement,p=source.provenance;
 if(SKY_MARKETPLACE_COMMISSION_BPS!==1000)throw new WorkError('契約の手数料版を再確認してください。',409);
 if(!terms || !bound || p.parentJobId!==parentJobId)throw new WorkError('計算可能な作者料条件と署名済み契約を登録してください。',409);
 const store=a2aDelegationStore(db),child=await store.get(owner,p.delegationId),row=await store.getUsageReceipt(owner,p.delegationId);
 const usage=row?observeStoredAgentUsage(row):null;
 if(!child || child.parentJobId!==parentJobId || child.state!=='remote_completed' || !row || !usage || await sha256Hex(row.receiptJson)!==p.receiptSha256 || row.currency!==bound.agreement.currency || usage.pricingVersion!==bound.agreement.pricingVersion || row.amountMinor>child.budgetLimitMinor)throw new WorkError('元の完了・利用receipt・契約と承認上限を照合できません。',409);
 const quote=child.priceQuote;
 if(!quote || !child.priceQuoteDigest || await a2aPriceQuoteDigest(quote)!==child.priceQuoteDigest || quote.providerId!==row.providerId || quote.pricingVersion!==usage.pricingVersion || quote.currency!==row.currency || quote.requestSha256!==child.inputSha256 || quote.agentOrigin!==child.targetOrigin || quote.agentName!==child.targetAgentName || quote.agentVersion!==child.targetAgentVersion || row.amountMinor>quote.maxAmountMinor)throw new WorkError('作者料を含む元の見積と利用明細を照合してください。',409);
 const lines=usage.metrics.filter(x=>x.meter===terms.authorCharge.meter),quoted=quote.usage.filter(x=>x.meter===terms.authorCharge.meter);
 if(lines.length!==1 || quoted.length!==1 || lines[0].unit!==terms.authorCharge.unit || quoted[0].unit!==terms.authorCharge.unit)throw new WorkError('契約で指定された作者料の項目・単位が見積と最終明細に必要です。',409);
 const line=lines[0],price=quoted[0].unitPriceMinor;
 if(line.quantity===null || !Number.isSafeInteger(line.amountMinor) || !Number.isSafeInteger(price) || price<0 || BigInt(line.quantity)*BigInt(price)!==BigInt(line.amountMinor!) || line.amountMinor!>row.amountMinor)throw new WorkError('作者料の数量・単価・金額が一致しません。',409);
 const gross=line.amountMinor!,commission=marketplaceCommissionMinor(gross);
 const id=await sha256Hex(JSON.stringify({domain:'sky.author-allocation-candidate/1',owner,parentJobId,delegationId:p.delegationId,receiptSha256:p.receiptSha256,agreementSha256:bound.agreementSha256}));
 return {schema:'sky.author-allocation-candidate/1',id,status:'pending_invoice_and_collection',delegationId:p.delegationId,receiptSha256:p.receiptSha256,agreementSha256:bound.agreementSha256,quoteDigest:child.priceQuoteDigest,currency:row.currency,receiptTotalMinor:row.amountMinor,otherUsageMinor:row.amountMinor-gross,authorMeter:line.meter,authorUnit:line.unit,allocation:{creatorId:bound.agreement.publisherId,grossMinor:gross,commissionMinor:commission,payableMinor:gross-commission,transferRef:null,transferRequestedAt:null,recoveryRequired:false},preparedAt:new Date().toISOString()};
}
