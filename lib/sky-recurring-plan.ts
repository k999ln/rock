import { WorkError } from './workflow.ts';
type DB = Pick<D1Database, 'prepare' | 'batch'>;
type Contribution = { kind: 'remote_llm' | 'a2a' | 'sandbox_fixture'; id: string; state: string; amount: number; reserved: number; providerReference: string | null };

/** Read-only projection of the same rows enforced by migration 0018. Never a replacement ledger or send authorization. */
export async function skyRecurringUsage(db: DB, owner: string, now = Date.now()) {
  const rows = await db.prepare(`WITH contract AS (SELECT * FROM sky_recurring_contracts WHERE owner_id=?),
    contributions AS (
      SELECT 'remote_llm' AS kind,e.id,e.state,
        CASE WHEN e.state='completed' THEN e.settled_minor ELSE 0 END AS amount,
        CASE WHEN e.state='completed' THEN 0 ELSE e.maximum_charge_minor END AS reserved,
        e.provider_response_id AS providerReference
      FROM remote_ai_text_executions e JOIN contract c ON c.owner_id=e.owner_user_id
      WHERE e.state IN ('reserved','sending','unreconciled') OR
        (e.state='completed' AND e.created_at>=c.period_start AND e.created_at<c.period_end)
      UNION ALL
      SELECT 'a2a',r.delegation_id,r.state,
        CASE WHEN r.state='settled' THEN r.settled_minor ELSE 0 END,
        CASE WHEN r.state='settled' THEN 0 ELSE r.reserved_minor END,a.provider_reference
      FROM agent_delegation_budget_reservations r JOIN contract c ON c.owner_id=r.owner_user_id
      LEFT JOIN a2a_usage_receipts a ON a.delegation_id=r.delegation_id AND a.owner_user_id=r.owner_user_id
      WHERE r.state='held' OR (r.state='settled' AND r.created_at>=c.period_start AND r.created_at<c.period_end)
      UNION ALL
      SELECT 'sandbox_fixture',t.id,'synthetic',t.fixture_minor,0,NULL FROM sky_hosted_monthly_tests t JOIN contract c ON c.id=t.contract_id AND c.owner_id=t.owner_id AND c.stripe_account_id=t.stripe_account_id WHERE c.consent_version='sky140-monthly-postpaid-sandbox-v1' AND t.period_start=c.period_start AND t.fixture_minor>0
    ) SELECT c.consent_version,c.stripe_account_id,c.status,c.period_start,c.period_end,c.access_until,x.*
      FROM contract c LEFT JOIN contributions x ON 1=1`).bind(owner).all<Contribution & {
        consent_version: string; stripe_account_id: string; status: string; period_start: number; period_end: number; access_until: number;
      }>();
  const c = rows.results[0];
  if (!c) throw new WorkError('Sandboxプラン契約が見つかりません。',404);
  const items = rows.results.filter(row => row.id !== null).map(({kind,id,state,amount,reserved,providerReference}) => ({kind,id,state,amount,reserved,providerReference}));
  const settledMinor = items.reduce((sum,row) => sum + row.amount,0);
  const reservedMinor = items.reduce((sum,row) => sum + row.reserved,0);
  const remainingMinor = Math.max(0,10000-settledMinor-reservedMinor);
  const reason = c.status!=='active' ? 'payment_or_contract_blocked' :
    c.access_until<=now || c.period_start>now || c.period_end<=now ? 'verification_expired' :
    remainingMinor===0 ? 'quota_exhausted' : 'available';
  const contractKind=c.consent_version==='sky140-monthly-postpaid-sandbox-v1' && c.stripe_account_id!=='acct_fixture_free_only' ? 'monthly_sandbox' : c.consent_version==='synthetic-free-only-v1' ? 'one_hour_synthetic' : 'other';
  return {contractKind,currency:'USD',monthlyFeeMinor:14000,includedMinor:10000,settledMinor,reservedMinor,remainingMinor,
    periodStart:c.period_start,periodEnd:c.period_end,reason,items};
}

