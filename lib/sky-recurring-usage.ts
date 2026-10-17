import { WorkError } from './workflow.ts';
import { readMonthlyStripeConfig } from './sky-cloud-monthly-stripe.ts';
import { RemoteAiTextStore } from './remote-ai-text-store.ts';
import { executeReservedRemoteAiText } from './remote-ai-text-execution.ts';
import { encryptRemoteAiTextInput } from './remote-ai-text-input.ts';
import { remoteAiTextRequestDigest } from './remote-ai-text-pricing.ts';
import { cloudMonthlySource } from './sky-cloud-monthly-source.ts';

type DB = Pick<D1Database, 'prepare' | 'batch'>;
type Contribution = { kind: 'remote_llm' | 'a2a'; id: string; state: string; amount: number; reserved: number; providerReference: string | null };

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
    ) SELECT c.status,c.period_start,c.period_end,c.access_until,x.*
      FROM contract c LEFT JOIN contributions x ON 1=1`).bind(owner).all<Contribution & {
        status: string; period_start: number; period_end: number; access_until: number;
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
  return {currency:'USD',monthlyFeeMinor:14000,includedMinor:10000,settledMinor,reservedMinor,remainingMinor,
    periodStart:c.period_start,periodEnd:c.period_end,reason,items};
}

/** Server-only opt-in acceptance entry. Caller must approve credentials, input and provider spend.
 * This does not open the production pricing gate. It uses the real existing coordinator/transport.
 */
export async function executeSkyPlanCloudText(input: Omit<Parameters<typeof executeReservedRemoteAiText>[0],'store'> & {
  db: DB; sandboxEnv: Record<string,unknown>; inputEncryptionKey: string;
}) {
  const config = readMonthlyStripeConfig(input.sandboxEnv);
  const contract = await input.db.prepare('SELECT id FROM sky_recurring_contracts WHERE owner_id=? AND stripe_account_id=?')
    .bind(input.ownerId,config.accountId).first<{id:string}>();
  if (!contract) throw new WorkError('Sandbox契約・アカウントが一致しません。',409);
  const store = new RemoteAiTextStore(input.db);
  const saved = await store.get(input.ownerId,input.id);
  if (!saved || saved.approvalDigest!==input.approvalDigest || saved.quote.requestDigest!==await remoteAiTextRequestDigest(input.intent))
    throw new WorkError('承認済み入力が一致しません。',409);
  const encrypted = await encryptRemoteAiTextInput(input.intent,input.inputEncryptionKey,input.ownerId,input.id);
  // Reserve in the same transaction/DB as the plan fence. Never trust a browser-reported remaining amount.
  const reserved = await store.reserve(input.ownerId,input.id,input.approvalDigest);
  if (reserved.state==='reserved' && !await store.getInput(input.ownerId,input.id))
    await store.saveInput(input.ownerId,input.id,input.approvalDigest,encrypted);
  const execution = await executeReservedRemoteAiText({...input,store});
  if (execution.record?.state==='completed') await store.deleteInputAfterTerminal(input.ownerId,input.id);
  const usage = execution.record?.state==='completed'
    ? await cloudMonthlySource(input.db,input.ownerId,'remote_llm',input.id) : null;
  return {execution,usage,plan:await skyRecurringUsage(input.db,input.ownerId)};
}
