// Shared launch limits. Values remain the design contract defaults.
export const NOAH_ASK_LIMITS = {
  open: 8, perMinute: 10, perDay: 200, hostPerMinute: 30,
  connectLive: 50, connectPerMinute: 10, connectPerDay: 100,
  hostHandshakes: 60,
};

/**
 * 1 つの相手（接続先）への依頼の枠（hostPerMinute）を、何人分に分けるか。task 129 の D2。
 * 1 人がその相手へ直近 60 秒に頼めるのは、枠の 3 分の 1（切り捨て、最低 1 回）まで。1 人が枠を使い切って、ほかの人が頼めなくなる事をなくす。
 * 既定（相手 30 回・本人 10 回）では本人の 1 分の上限と同じ数なので、本人の上限（perMinute）を上げた時や、相手の枠を下げた時に効く。
 */
export const NOAH_ASK_HOST_SHARES = 3;
export function noahAskOwnerHostLimit(hostPerMinute: number): number {
  return Math.max(1, Math.floor(hostPerMinute / NOAH_ASK_HOST_SHARES));
}
