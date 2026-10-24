import { verifyLinuxContractSnapshot, type LinuxContractEnvelope } from './sky-linux-billing.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { SkyPaymentError } from './sky-stripe.ts';

// Pure reviewed binding subset; persistence and source aggregation remain in the source lane.
type Item = {
  paymentId: string; sourceId: string; parentJobId: string; threadId: string;
  digest: string; confirmationId: string; agreementSha256: string; receiptSha256: string;
  publisherId: string; amountMinor: number; observedMinor: number;
  authorGrossMinor: number; commissionMinor: number; authorPayableMinor: number; otherUsageMinor: number;
};
export type AgentMonthlyStatement = {
  schema: 'sky.agent-monthly-statement/1'; id: string; ownerId: string;
  period: string; currency: 'USD' | 'JPY'; mode: 'test'; state: 'draft_unreconciled';
  baseMinor: 0; invoice: 'not_created'; collection: 'disabled'; customerPayment: 'unconfirmed';
  amountMinor: number; observedMinor: number; authorGrossMinor: number;
  commissionMinor: number; authorPayableMinor: number; otherUsageMinor: number;
  items: Item[];
};
function periodRange(period: string) {
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)) throw new SkyPaymentError('月をYYYY-MM形式で指定してください。');
  const from = Date.parse(period + '-01T00:00:00Z');
  const until = new Date(from); until.setUTCMonth(until.getUTCMonth() + 1);
  if (from > Date.now()) throw new SkyPaymentError('未来の月はまだ保存できません。');
  return { from, until: until.getTime() };
}
/** Read-only binding proposal. Existing draft/base0 and payment/ledger rows are untouched.
 * Call only with a server-read document and saved consent; API/persistence wiring is separate.
 */
export async function bindAgentMonthlyContract(
  saved: { revision: number; statement: AgentMonthlyStatement },
  envelope: LinuxContractEnvelope,
  expected: Parameters<typeof verifyLinuxContractSnapshot>[1] & { revision: number },
) {
  // Keep statement identity, consent, digest and revision on one input snapshot.
  ({ saved, envelope, expected } = structuredClone({ saved, envelope, expected }));
  const contract = await verifyLinuxContractSnapshot(envelope, expected);
  const s = saved.statement;
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 0 || saved.revision !== expected.revision ||
    s.schema !== 'sky.agent-monthly-statement/1' || s.ownerId !== contract.ownerId || s.currency !== contract.currency ||
    s.mode !== 'test' || s.state !== 'draft_unreconciled' || s.baseMinor !== 0 || s.invoice !== 'not_created' ||
    s.collection !== 'disabled' || s.customerPayment !== 'unconfirmed' ||
    !Number.isSafeInteger(s.amountMinor) || s.amountMinor < 0)
    throw new SkyPaymentError('保存済みdraftの本人・通貨・版・未請求状態を確認してください。', 409);
  periodRange(s.period);
  return Object.freeze({
    schema: 'sky.agent-monthly-contract-binding/1' as const,
    statementId: s.id, statementRevision: saved.revision,
    statementDigest: await sha256Hex(JSON.stringify(s)), contractId: contract.contractId,
    snapshotDigest: envelope.digest, period: s.period, currency: s.currency,
    state: contract.status === 'pending_owner_terms' || contract.start.state !== 'started' ? 'pending' as const : 'draft_only' as const,
    baseIncluded: false as const, invoiceCreated: false as const, collectionEnabled: false as const,
  });
}
