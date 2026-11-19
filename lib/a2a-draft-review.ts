import { a2aDelegationStore } from './a2a-delegation-store.ts';
import { decryptA2AInput } from './a2a-input-crypto.ts';
import { createA2AIntentDigests } from './a2a-authorization.ts';
import { workStore } from './work-store.ts';
import { WorkError } from './workflow.ts';
/** Restores data for review, never an approval or a remote send. */
export async function readA2ADraftReview(db: Pick<D1Database, 'prepare'|'batch'>, owner: string, id: string, key?: string, now = Date.now()) {
  const store = a2aDelegationStore(db), d = await store.get(owner, id);
  if (!d) throw new WorkError('委任が見つかりません。', 404);
  const parent = await workStore(db).get(owner, d.parentJobId);
  if (!parent || !['active', 'review'].includes(parent.status) || parent.eveAgent?.stopRequestedAt !== undefined || d.state !== 'awaiting_approval' || d.deadlineAt <= now)
    throw new WorkError('この依頼は承認待ちではありません。最新状態を確認してください。', 409);
  if (parent.eveAgent) {
    const tombstone = await db.prepare('SELECT deleted_at AS deletedAt FROM eve_conversations WHERE owner_id=? AND id=?').bind(owner, parent.eveAgent.threadId).first<{deletedAt:number}>();
    if (!tombstone || tombstone.deletedAt) throw new WorkError('会話は削除済みか利用できません。', 410);
  }
  const input = await store.getInput(owner, id);
  if (!input || input.expiresAt <= now) throw new WorkError('この旧下書きには再開用の本文が保存されていません。同じ依頼内容を再確認してください。', 409);
  if (!key) throw new WorkError('依頼本文の復号鍵を復旧してから再確認してください。', 503);
  const message = await decryptA2AInput({ ...input, keyVersion: input.keyVersion as 'aes-256-gcm-v1' }, key, owner, id);
  const request = { id:d.id,parentJobId:d.parentJobId,...(d.predecessorDelegationId?{predecessorDelegationId:d.predecessorDelegationId}:{}),idempotencyKey:d.idempotencyKey,messageId:d.messageId,targetOrigin:d.targetOrigin,targetAgentName:d.targetAgentName,targetAgentVersion:d.targetAgentVersion,message,budgetCurrency:d.budgetCurrency,budgetLimitMinor:d.budgetLimitMinor,parentBudgetLimitMinor:d.parentBudgetLimitMinor,continueWhileDeviceOffline:d.continueWhileDeviceOffline,deadlineAt:d.deadlineAt,...(d.priceQuote?{priceQuote:d.priceQuote}:{}),...(d.packageRuntimeBindingId?{packageRuntimeBindingId:d.packageRuntimeBindingId,packageRuntimeBindingDigest:d.packageRuntimeBindingDigest}:{}) };
  const digests = await createA2AIntentDigests({ ...request, ownerUserId:owner, protocolVersion:d.protocolVersion, priceQuoteDigest:d.priceQuoteDigest || undefined,packageRuntimeBindingDigest:d.packageRuntimeBindingDigest || undefined });
  if (digests.inputSha256 !== d.inputSha256 || digests.authorizationSha256 !== d.authorizationSha256) throw new WorkError('保存した依頼条件を照合できません。上書きせず確認してください。', 409);
  const stillCurrent = await db.prepare(`SELECT d.id FROM agent_delegations d
    JOIN work_jobs w ON w.id=d.parent_job_id AND w.user_id=d.owner_user_id
    WHERE d.owner_user_id=? AND d.id=? AND d.revision=? AND d.state='awaiting_approval' AND d.deadline_at>?
      AND w.revision=? AND json_extract(w.payload,'$.status') IN ('active','review')
      AND json_extract(w.payload,'$.eveAgent.stopRequestedAt') IS NULL
      AND (json_extract(w.payload,'$.eveAgent.threadId') IS NULL OR EXISTS
        (SELECT 1 FROM eve_conversations c WHERE c.owner_id=d.owner_user_id
          AND c.id=json_extract(w.payload,'$.eveAgent.threadId') AND c.deleted_at=0))`)
    .bind(owner,id,d.revision,now,parent.revision).first();
  if (!stillCurrent) throw new WorkError('確認中に仕事や依頼が更新されました。同じ仕事を再読込してください。', 409);
  return { request, delegationId:d.id,authorizationSha256:d.authorizationSha256 };
}
