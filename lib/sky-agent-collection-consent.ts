export type AgentCollectionConsent = {
 schema:'sky.agent-collection-consent/1';id:string;ownerId:string;sourceId:string;
 statementDigest:string;allocationCandidateId:string;agreementSha256:string;receiptSha256:string;
 amountMinor:number;currency:string;recordedAt:string;status:'recorded_pending_invoice_reconciliation';
};
export function collectionConsentMatches(consent:AgentCollectionConsent|undefined,expected:{ownerId:string;sourceId:string;statementDigest:string;allocationCandidateId:string;agreementSha256:string;receiptSha256:string;amountMinor:number|null;currency:string}) {
 return !!consent && consent.schema==='sky.agent-collection-consent/1' && /^[a-f0-9]{64}$/.test(consent.id) &&
  consent.status==='recorded_pending_invoice_reconciliation' && Number.isFinite(Date.parse(consent.recordedAt)) &&
  Object.entries(expected).every(([key,value])=>consent[key as keyof AgentCollectionConsent]===value);
}
