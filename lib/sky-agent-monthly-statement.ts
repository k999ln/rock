import { verifyLinuxContractSnapshot, type LinuxContractEnvelope } from './sky-linux-billing.ts';
import { agentUsageStatement } from './sky-agent-usage-statement.ts';
import { sha256Hex } from './rockstar-entitlement-claim.ts';
import { SkyPaymentError } from './sky-stripe.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
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
type Stored = { revision: number; payload: string };
const kind = 'agent_monthly_statement';
function periodRange(period: string) {
  if (!/^20\d\d-(0[1-9]|1[0-2])$/.test(period)) throw new SkyPaymentError('月をYYYY-MM形式で指定してください。');
  const from = Date.parse(period + '-01T00:00:00Z');
  const until = new Date(from); until.setUTCMonth(until.getUTCMonth() + 1);
  if (from > Date.now()) throw new SkyPaymentError('未来の月はまだ保存できません。');
  return { from, until: until.getTime() };
}
async function read(db: Database, owner: string, id: string) {
  return db.prepare('SELECT revision,payload FROM sky_linux_service_documents WHERE id=? AND owner_user_id=? AND kind=?')
    .bind(id, owner, kind).first<Stored>();
}
export async function readAgentMonthlyStatement(db: Database, owner: string, id: string) {
  const row = await read(db, owner, id);
  if (!row) throw new SkyPaymentError('このアカウントの月次明細が見つかりません。', 404);
  return { revision: row.revision, statement: JSON.parse(row.payload) as AgentMonthlyStatement };
}
/** A draft document references existing prepared payments; it grants no invoice, debit or payout authority. */
export async function saveAgentMonthlyStatement(db: Database, owner: string, runtime: Record<string, unknown>, period: string, currency: string) {
  if (runtime.SKY_PAYMENTS_MODE !== 'test' || runtime.SKY_USAGE_AGENT_INVOICE_PREPARATION_ENABLED !== 'true')
    throw new SkyPaymentError('月次明細の検証用保存は有効になっていません。', 503);
  const range = periodRange(period);
  if (currency !== 'USD' && currency !== 'JPY') throw new SkyPaymentError('元の通貨をUSDまたはJPYで指定してください。');
  const id = 'agent-monthly:' + await sha256Hex(JSON.stringify({ owner, period, currency, mode: 'test' }));
  const before = await read(db, owner, id);
  const rows = await db.prepare("SELECT p.id,p.agent_source_id AS sourceId,p.source_digest AS digest,p.confirmation_id AS confirmationId,p.amount_minor AS amountMinor FROM sky_usage_payments p JOIN a2a_usage_receipts r ON r.delegation_id=p.agent_source_id AND r.owner_user_id=p.owner_user_id WHERE p.owner_user_id=? AND p.mode='test' AND p.source_kind='sky_agent' AND p.state='prepared' AND p.currency=? AND r.issued_at>=? AND r.issued_at<? ORDER BY p.id LIMIT 201")
    .bind(owner, currency.toLowerCase(), range.from, range.until).all<{ id: string; sourceId: string; digest: string; confirmationId: string; amountMinor: number }>();
  if (!rows.results.length || rows.results.length > 200)
    throw new SkyPaymentError(rows.results.length ? '月次明細の保存上限を超えています。記録を省略せず保留します。' : 'この月・通貨の保存済み請求準備はありません。', 409);
  const items: Item[] = [];
  for (const row of rows.results) {
    const source = await agentUsageStatement(db, owner, row.sourceId, typeof runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS === 'string' ? runtime.SKY_AUTHOR_AGREEMENT_TRUSTED_KEYS : undefined);
    if (source.digest !== row.digest || source.collectionConsent?.id !== row.confirmationId || source.currency !== currency || source.collectionPlan?.platformInvoiceCandidateMinor !== row.amountMinor)
      throw new SkyPaymentError('元明細・契約・本人確認と請求準備が一致しません。', 409);
    items.push({ paymentId: row.id, sourceId: row.sourceId, parentJobId: source.parentJobId, threadId: source.threadId,
      digest: row.digest, confirmationId: row.confirmationId, agreementSha256: source.agreementSha256, receiptSha256: source.receiptSha256,
      publisherId: source.publisherId, amountMinor: row.amountMinor, observedMinor: source.observedAmountMinor,
      authorGrossMinor: source.authorGrossMinor, commissionMinor: source.commissionMinor, authorPayableMinor: source.authorPayableCandidateMinor, otherUsageMinor: source.otherUsageMinor });
  }
  const sum = (key: 'amountMinor' | 'observedMinor' | 'authorGrossMinor' | 'commissionMinor' | 'authorPayableMinor' | 'otherUsageMinor') => {
    const value = items.reduce((total, item) => total + BigInt(item[key]), BigInt(0));
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new SkyPaymentError('合計額が保存上限を超えています。', 409);
    return Number(value);
  };
  const statement: AgentMonthlyStatement = { schema: 'sky.agent-monthly-statement/1', id, ownerId: owner, period, currency, mode: 'test', state: 'draft_unreconciled', baseMinor: 0, invoice: 'not_created', collection: 'disabled', customerPayment: 'unconfirmed',
    amountMinor: sum('amountMinor'), observedMinor: sum('observedMinor'), authorGrossMinor: sum('authorGrossMinor'), commissionMinor: sum('commissionMinor'), authorPayableMinor: sum('authorPayableMinor'), otherUsageMinor: sum('otherUsageMinor'), items };
  const payload = JSON.stringify(statement);
  if (before?.payload === payload) return { revision: before.revision, statement };
  try {
    const result = before
      ? await db.prepare('UPDATE sky_linux_service_documents SET payload=?,revision=revision+1,updated_at=? WHERE id=? AND owner_user_id=? AND kind=? AND revision=?')
        .bind(payload, Date.now(), id, owner, kind, before.revision).run()
      : await db.prepare('INSERT INTO sky_linux_service_documents(id,owner_user_id,kind,period,currency,revision,payload,updated_at) VALUES (?,?,?,?,?,0,?,?) ON CONFLICT(id) DO NOTHING')
        .bind(id, owner, kind, period, currency, payload, Date.now()).run();
    const after = await read(db, owner, id);
    if (!after || after.payload !== payload || (!result.meta.changes && before && after.revision === before.revision))
      throw new SkyPaymentError('月次明細が更新されました。同じ月を読み直してください。', 409);
    return { revision: after.revision, statement };
  } catch (error) {
    if (error instanceof SkyPaymentError) throw error;
    throw new SkyPaymentError('契約または明細が変更されました。同じ月を読み直してください。', 409);
  }
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
