import { effectRequiresUserApproval } from './decision/policy.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import type { NoahOutbox } from './noah-outbox.ts';

/** Broker boundary: account authority and the saved exact intent are required;
 * an Agent output, source/invite grant, or delivery target is never approval. */
export function authorizeNoahSend(outbox:NoahOutbox,ownerScope:string,now:number){
  const approval=outbox.approval;
  if(!effectRequiresUserApproval('external-write')||outbox.state!=='approved'||!approval||approval.ownerScope!==ownerScope||approval.snapshotSha256!==outbox.snapshotSha256||approval.expiresAt<=now||approval.confirmation!=='noah-external-send/1')throw new NoahAgentError('送信内容・宛先を確認して、もう一度承認してください。',409);
  if(outbox.destination.pricing!=='free')throw new NoahAgentError('この送信には既存Walletの料金・予算確認が必要です。',422);
}
