import type { EveCombination } from './eve-combination.ts';
import { eveAuthorShare, eveScore, type EveOutcomeRecord } from './eve-combination-score.ts';

/** A read-only illustration for the referral example. These records never enter a ledger. */
export function eveAuthorShareExample(combination: EveCombination) {
  if (combination.id !== 'affiliate:ai-tools:blog') return null;
  const job = { combinationId: combination.id, version: combination.version, count: 1 };
  const start = '2026-11-01T00:00:00Z';
  const approval = '2026-11-02T00:00:00Z';
  const deposit = '2026-11-09T00:00:00Z';
  const exampleRecords: EveOutcomeRecord[] = [
    { ...job, at: start, stage: 'made', source: 'work', reference: 'example:work:cost', costYen: 1_000 },
    { ...job, at: approval, stage: 'approved', source: 'asp', reference: 'example:asp:approved', amountYen: 8_000 },
    { ...job, at: deposit, stage: 'paid', source: 'bank', reference: 'example:bank:deposit', amountYen: 8_000 },
  ];
  function through(to: string) {
    const score = eveScore(combination, exampleRecords, { from: start, to });
    const share = eveAuthorShare(score, 'example:other-user');
    return {
      conversionReached: (score.funnel.approved ?? 0) > 0,
      approvedYen: score.approvedYen,
      paidYen: score.funnel.paid === null ? null : score.paidYen,
      costYen: score.costYen,
      shareYen: share.shareYen,
    };
  }
  return { atApproval: through(approval), atDeposit: through(deposit) };
}
