import { WorkError } from './workflow.ts';
import { readMonthlyStripeConfig } from './sky-cloud-monthly-stripe.ts';
import { RemoteAiTextStore } from './remote-ai-text-store.ts';
import { executeReservedRemoteAiText } from './remote-ai-text-execution.ts';
import { encryptRemoteAiTextInput } from './remote-ai-text-input.ts';
import { remoteAiTextRequestDigest } from './remote-ai-text-pricing.ts';
import { cloudMonthlySource } from './sky-cloud-monthly-source.ts';

import { skyRecurringUsage } from './sky-recurring-plan.ts';
export { skyRecurringUsage } from './sky-recurring-plan.ts';
type DB = Pick<D1Database, 'prepare' | 'batch'>;

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
