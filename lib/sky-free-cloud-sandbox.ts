import { freeCloudEnabled, type FreeCloudRuntime } from './sky-free-cloud.ts';
import { WorkError } from './workflow.ts';

/** Explicitly synthetic, one-hour, free-only UI acceptance. Never calls a payment provider. */
export async function enrollFreeCloudSandbox(db: Pick<D1Database,'prepare'>, owner: string, runtime: FreeCloudRuntime & { SKY_FREE_CLOUD_SANDBOX_SETUP?: string }, consent: unknown, now=Date.now()) {
  if (!freeCloudEnabled(runtime,owner) || runtime.SKY_FREE_CLOUD_SANDBOX_SETUP!=='true') throw new WorkError('このアカウントの無料検証は有効になっていません。',403);
  if(consent!=='synthetic-free-only-v1') throw new WorkError('請求なしの合成テスト契約への同意が必要です。',400);
  await db.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES(?,?,'acct_fixture_free_only','cus_fixture','pm_fixture','synthetic-free-only-v1',14000,?,?,'active',?,?,?) ON CONFLICT(owner_id) DO NOTHING`).bind(crypto.randomUUID(),owner,now,now+3600000,now+3600000,now,now).run();
  return {contract:'synthetic-free-only-v1',productionBilling:false};
}
