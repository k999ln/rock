import {collectionConsentMatches} from './sky-agent-collection-consent.ts';
import {agentCollectionPlan} from './sky-agent-collection-plan.ts';
import { a2aDelegationStore } from './a2a-delegation-store.ts';
import { workStore } from './work-store.ts';
import { observeAgentUsageProvenance, resolveCapturedAgentUsageSource } from './sky-agent-usage-provenance.ts';
import { verifyAuthorUsageAgreement } from './sky-author-usage-agreement.ts';
import { authorAgreementDocuments } from './sky-author-agreement-documents.ts';
import { prepareAuthorAllocation } from './sky-author-remuneration.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { SkyPaymentError } from './sky-stripe.ts';
import { WorkError } from './workflow.ts';

/** A read-only statement at the existing payment boundary. No payable invoice,
 * customer collection or developer transfer is implied by metered usage. */
export async function agentUsageStatement(db: Pick<D1Database,'prepare'|'batch'>, owner: string, id: string, keys?: string) {
 try {
  const child=await a2aDelegationStore(db).get(owner,id);
  const job=child?await workStore(db).get(owner,child.parentJobId):null;
  if(!child || !job)throw new SkyPaymentError('利用記録が見つかりません。',404);
  const source=job.eveAgent?.usageSources?.find(s=>s.provenance.delegationId===id);
  const resolved=resolveCapturedAgentUsageSource(source,await observeAgentUsageProvenance(db,owner,job.id,id));
  if(!source?.authorAgreement || !source.authorAllocation || resolved.state!=='captured' || resolved.currentBindingStatus!=='active')
   throw new SkyPaymentError('同じ仕事で利用元・作者契約・配分候補を確認してください。',409);
  const agreement=await verifyAuthorUsageAgreement(source.authorAgreement.agreement,source,keys);
  if(agreement.agreementSha256!==source.authorAgreement.agreementSha256)throw new SkyPaymentError('保存した契約と署名が一致しません。',409);
  const document=await authorAgreementDocuments(db).valid(agreement.agreement,agreement.agreementSha256);
  if(!document)throw new SkyPaymentError('契約本文が失効したか、内容を照合できません。',409);
  const candidate=await prepareAuthorAllocation(db,owner,job.id,source,document.termsText);
  const normalized=({...v}:typeof candidate)=>{delete (v as Partial<typeof candidate>).preparedAt;return v;};
  if(JSON.stringify(normalized(candidate))!==JSON.stringify(normalized(source.authorAllocation)))
   throw new SkyPaymentError('元の見積・明細と保存した配分候補が一致しません。',409);
  const digest=await sha256Hex(JSON.stringify({domain:'sky.agent-usage-statement/1',owner,parentJobId:job.id,sourceId:id,candidate:normalized(candidate)}));
  const plan=agentCollectionPlan(document.termsText,candidate);
  const consentRecorded=plan?.mode==='platform_invoice' && collectionConsentMatches(source.collectionConsent,{ownerId:owner,sourceId:id,statementDigest:digest,allocationCandidateId:candidate.id,agreementSha256:candidate.agreementSha256,receiptSha256:candidate.receiptSha256,amountMinor:plan.platformInvoiceCandidateMinor,currency:candidate.currency});
  const customerConsent=consentRecorded?'recorded_pending_invoice_reconciliation' as const:'missing' as const;
  return {schema:'sky.agent-usage-statement/1' as const,source:'sky_agent' as const,sourceId:id,parentJobId:job.id,threadId:job.eveAgent!.threadId,jobRevision:job.revision,
   currency:candidate.currency,observedAmountMinor:candidate.receiptTotalMinor,approvedCapMinor:child.budgetLimitMinor,
   authorGrossMinor:candidate.allocation.grossMinor,commissionMinor:candidate.allocation.commissionMinor,
   authorPayableCandidateMinor:candidate.allocation.payableMinor,otherUsageMinor:candidate.otherUsageMinor,
   publisherId:candidate.allocation.creatorId,receiptSha256:candidate.receiptSha256,quoteDigest:candidate.quoteDigest,
   agreementSha256:candidate.agreementSha256,allocationCandidateId:candidate.id,digest,
   collectionPlan:plan?{...plan,customerConsent,status:consentRecorded?'awaiting_invoice_reconciliation' as const:plan.status}:null,
   customerConsent,collectionConsent:consentRecorded?source.collectionConsent:null,
   collection:'not_configured' as const,providerInvoice:'unreconciled' as const,customerPayment:'unconfirmed' as const};
 } catch(error) {if(error instanceof WorkError)throw new SkyPaymentError(error.message,error.status);throw error;}
}
export type AgentUsageStatement=Awaited<ReturnType<typeof agentUsageStatement>>;
