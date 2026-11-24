import { EVE_AUTHOR_SHARE_BPS, eveAuthorShare } from './eve-combination-score.ts';
import { isNoahRevenueOperation, noahRevenueReadContext, type NoahRevenueConfig } from './noah-revenue-operation.ts';
import type { WorkJob } from './workflow.ts';
import type { EveAuthor } from './eve-combination.ts';

/** Owner-only display summary. A missing external receipt is distinct from a verified zero. */
export type NoahWorkRevenueReceipt = {
  evidenceConnection?: 'connected' | 'unconfigured';
  approvedYen: number | null;
  paidYen: number | null;
  costYen: number | null;
  shareBps: number;
  authorShareYen: number | null;
  authorShareStatus: 'pending-payment' | 'pending-cost' | 'confirmed' | 'not-applicable' | 'unresolved';
};

type RecordedAmount = {
  stage: 'approved' | 'paid' | 'cost';
  amountYen: number;
  source: string;
  reference: string;
};

/** Only call with the private operation record after the owner and Work have been matched. */
export function noahWorkRevenueReceipt(operation: {
  combinationId: string; version: number; author: EveAuthor; authorRelation: 'self' | 'other' | 'unknown'; receipts: readonly RecordedAmount[];
}, owner: string): NoahWorkRevenueReceipt {
  const summary: NoahWorkRevenueReceipt = {
    approvedYen: null, paidYen: null, costYen: null,
    shareBps: EVE_AUTHOR_SHARE_BPS, authorShareYen: null, authorShareStatus: 'unresolved',
  };
  const totals: Record<RecordedAmount['stage'], number | null> = { approved: null, paid: null, cost: null };
  const seen = new Map<string, number>();
  for (const receipt of operation.receipts) {
    if (!Object.hasOwn(totals, receipt.stage) || !receipt.source || !receipt.reference
      || !Number.isSafeInteger(receipt.amountYen) || receipt.amountYen < 0) return summary;
    const key = JSON.stringify([receipt.stage, receipt.source, receipt.reference]);
    if (seen.has(key)) {
      if (seen.get(key) !== receipt.amountYen) return summary;
      continue;
    }
    seen.set(key, receipt.amountYen);
    // The cost receipt attests to the final, complete cost of this Work (not another line item).
    if (receipt.stage === 'cost' && totals.cost !== null) return summary;
    const sum = (totals[receipt.stage] ?? 0) + receipt.amountYen;
    if (!Number.isSafeInteger(sum)) return summary;
    totals[receipt.stage] = sum;
  }
  summary.approvedYen = totals.approved;
  summary.paidYen = totals.paid;
  summary.costYen = totals.cost;
  if (operation.authorRelation === 'self') {
    summary.authorShareStatus = 'not-applicable';
  } else if (totals.paid === null) {
    summary.authorShareStatus = 'pending-payment';
  } else if (totals.cost === null) {
    summary.authorShareStatus = 'pending-cost';
  } else if (operation.authorRelation === 'other') {
    const share = eveAuthorShare({
      combinationId: operation.combinationId, version: operation.version, author: operation.author,
      funnel: { paid: 1 }, costComplete: true, paidYen: totals.paid, costYen: totals.cost,
    }, owner, EVE_AUTHOR_SHARE_BPS, false);
    summary.authorShareStatus = 'confirmed';
    summary.authorShareYen = share.shareYen ?? 0;
  }
  return summary;
}

/** The API has already loaded this Work through the signed-in owner's scope. */
export function noahWorkRevenueDetail(job: WorkJob | null, owner: string, config?: NoahRevenueConfig) {
  const operation = job?.noahRevenue;
  if (!job || operation?.schema !== 'noah-work-revenue/1') return {};
  if (!isNoahRevenueOperation(job) && (job.templateId !== 'noah-agent-remote' || !operation.issuer || !operation.target
    || operation.target.familyKey !== job.noahRemote?.familyKey || operation.target.tool !== job.noahRemote.tool)) return {};
  const context = noahRevenueReadContext(job, owner, config);
  if (!context) return {};
  const revenueReceipt: NoahWorkRevenueReceipt = {
    ...noahWorkRevenueReceipt(context.operation, owner),
    evidenceConnection: context.receivingConfigured ? 'connected' : 'unconfigured',
  };
  return { revenueReceipt };
}
