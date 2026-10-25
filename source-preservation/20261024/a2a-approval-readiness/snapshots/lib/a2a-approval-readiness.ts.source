import { matchesA2ADelegationRecovery, type A2ADelegationRecoveryRequest, type A2ADelegationRecoveryRecord } from './a2a-delegation-recovery.ts';
export type A2AApprovalReview = { request: A2ADelegationRecoveryRequest & { priceQuote?: { expiresAt: number } }; delegationId: string; authorizationSha256: string };
export type A2AApprovalStatus = { delegation: A2ADelegationRecoveryRecord; executionEnabled?: boolean; brokerAuthorization?: { registered: boolean; expiresAt?: number } };
/** UI guidance only. The existing approval API must verify signatures, ownership and budget again. */
export async function a2aApprovalReadiness(review: A2AApprovalReview, status: A2AApprovalStatus, now = Date.now()) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(review.request.message));
  const hash = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  if (review.delegationId !== review.request.id || !matchesA2ADelegationRecovery(review.request, status.delegation, hash) || review.authorizationSha256 !== status.delegation.authorizationSha256)
    return { ready: false, message: '保存した依頼条件と画面が一致しません。同じ仕事を再読込してください。' };
  if (status.delegation.state !== 'awaiting_approval') return { ready: false, message: 'この依頼は承認待ちではありません。最新の進捗を確認してください。' };
  if (review.request.deadlineAt <= now || !review.request.priceQuote || !Number.isSafeInteger(review.request.priceQuote.expiresAt) || review.request.priceQuote.expiresAt <= now)
    return { ready: false, message: '依頼または見積の期限が切れています。最新の見積から条件を確認してください。' };
  if (status.executionEnabled !== true) return { ready: false, message: 'この環境ではAgent実行が有効になっていません。接続設定を確認してください。' };
  if (status.brokerAuthorization?.registered !== true || !Number.isSafeInteger(status.brokerAuthorization.expiresAt) || status.brokerAuthorization.expiresAt! <= now)
    return { ready: false, message: '接続したRockstarOS端末で、この依頼内容・送信先・上限を承認し、もう一度確認してください。' };
  return { ready: true, message: 'Broker承認の登録を確認しました。実行予約時に署名・失効・予算を再検証します。' };
}
