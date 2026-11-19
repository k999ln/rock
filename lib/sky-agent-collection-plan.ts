import { parseAuthorRemunerationTerms } from './sky-author-remuneration-terms.ts';
import type { AuthorAllocationCandidate } from './sky-author-remuneration.ts';
/** Only receives the server-recomputed candidate and its verified signed text.
 * This is an invoice preparation plan, never consent, an invoice, or a payment. */
export function agentCollectionPlan(text:string,candidate:AuthorAllocationCandidate) {
 const terms=parseAuthorRemunerationTerms(text);
 if(!terms || terms.schema!=='sky.author-remuneration-terms/2')return null;
 const route=terms.collection;
 return {schema:'sky.agent-collection-plan/1' as const,...route,
  allocationCandidateId:candidate.id,agreementSha256:candidate.agreementSha256,receiptSha256:candidate.receiptSha256,
  currency:candidate.currency,
  platformInvoiceCandidateMinor:route.mode==='external_provider'?null:route.chargeScope==='author_fee'?candidate.allocation.grossMinor:candidate.receiptTotalMinor,
  excludedOtherUsageMinor:route.mode==='platform_invoice' && route.chargeScope==='author_fee'?candidate.otherUsageMinor:null,
  status:route.mode==='external_provider'?'external_provider_reconciliation_required' as const:'awaiting_collection_consent_and_invoice_reconciliation' as const,
  customerConsent:'missing' as const,providerInvoice:'unreconciled' as const,invoice:'not_created' as const};
}
