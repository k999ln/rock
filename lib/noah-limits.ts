/**
 * Noah: つなぐ前・頼む前の上限（1 人が続けて使いすぎない。1 つの接続先へ、Noah の利用者が集まりすぎない）。
 * 通信も保存もしない。数え方の SQL は lib/noah-intake-store.ts の NOAH_LISTING_SQL（gate・connect_gate・host_take）。
 * 仕様: docs/noah/spec-87-tool-agent.md 11 章、docs/noah/spec-74-one-click-connect.md 11 章、docs/noah/spec-97-launch-ops.md 7 章。
 */

/**
 * 数値は候補。本人が変える（環境変数 NOAH_ASK_LIMITS の JSON で、項目ごとに上書きできる）。
 * open〜hostPerMinute は依頼。connect* は接続。hostHandshakes は、1 つの接続先へ、利用者の操作から始める握手
 * （接続・道具の一覧・依頼）を、全員合わせて 60 秒の枠に何回まで行うか（host_take の :limit）。
 */
export const NOAH_ASK_LIMITS = {
  open: 8, perMinute: 10, perDay: 200, hostPerMinute: 30,
  connectLive: 50, connectPerMinute: 10, connectPerDay: 100,
  hostHandshakes: 60,
};
/** 接続先の枠（host_take）が取れなかった時の文。相手が「混んでいる」と返して待っている間も、同じ文を出す。 */
export const NOAH_HOST_BUSY = 'この Agent は、今こんでいます。少し待ってから試してください。';

export type NoahAskGate = { ok: true } | { ok: false; status: 409 | 429; code: 'open' | 'minute' | 'day' | 'host'; message: string };
/**
 * 頼む前の検査。数は呼ぶ側が数えて渡す（本人の終わっていない依頼、本人の直近 60 秒、本人の直近 24 時間、接続先の直近 60 秒）。
 * 「1 日」は、時刻の帯に依らないように、直近 24 時間で数える。上から順に見て、最初に越えた物を返す。
 */
export function noahAskGate(
  counts: { open: number; lastMinute: number; lastDay: number; hostLastMinute: number },
  limits: Pick<typeof NOAH_ASK_LIMITS, 'open' | 'perMinute' | 'perDay' | 'hostPerMinute'> = NOAH_ASK_LIMITS,
): NoahAskGate {
  if (counts.open >= limits.open) return { ok: false, status: 409, code: 'open', message: '進んでいる依頼が多すぎます。終わるまで待ってください。' };
  if (counts.lastMinute >= limits.perMinute) return { ok: false, status: 429, code: 'minute', message: '続けて頼みすぎています。少し待ってから試してください。' };
  if (counts.lastDay >= limits.perDay) return { ok: false, status: 429, code: 'day', message: 'この 24 時間の回数を使い切りました。時間をおいて、また使えます。' };
  if (counts.hostLastMinute >= limits.hostPerMinute) return { ok: false, status: 429, code: 'host', message: NOAH_HOST_BUSY };
  return { ok: true };
}

export type NoahConnectGate = { ok: true } | { ok: false; status: 409 | 429; code: 'live' | 'minute' | 'day'; message: string };
/**
 * つなぐ前の検査。新しく接続の行を作る時だけ行う（同じ操作の再送と、もうつながっている物は数えない）。
 * 数は呼ぶ側が数えて渡す（本人の、切っていない接続・直近 60 秒に作った接続・直近 24 時間に作った接続）。
 * 切ってつなぎ直す事を繰り返して、相手のサーバーへ握手を送り続ける使い方を止める。
 */
export function noahConnectGate(
  counts: { live: number; lastMinute: number; lastDay: number },
  limits: Pick<typeof NOAH_ASK_LIMITS, 'connectLive' | 'connectPerMinute' | 'connectPerDay'> = NOAH_ASK_LIMITS,
): NoahConnectGate {
  if (counts.live >= limits.connectLive) return { ok: false, status: 409, code: 'live', message: 'つながっているものが多すぎます。使っていないものを切ってください。' };
  if (counts.lastMinute >= limits.connectPerMinute) return { ok: false, status: 429, code: 'minute', message: '続けてつなぎすぎています。少し待ってから試してください。' };
  if (counts.lastDay >= limits.connectPerDay) return { ok: false, status: 429, code: 'day', message: 'この 24 時間につなげる数を使い切りました。時間をおいて、また使えます。' };
  return { ok: true };
}
