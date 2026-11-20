// Promoted from docs/contracts/noah-intake-v1.ts for launch L3.
export const NOAH_WAKE = { path: '/api/noah/intake/tick', maxSkewMs: 120_000, minKeyChars: 32 };
const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
async function hmacKey(key: string, usage: 'sign' | 'verify') {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}
const wakeMessage = (timestamp: string, path: string) => new TextEncoder().encode(`${timestamp}\nPOST\n${path}\n{}`);

/** 合図の署名（hex 64 桁）。送る側が使う。header は x-noah-time（ミリ秒 13 桁）と x-noah-signature。 */
export async function noahWakeSignature(key: string, timestamp: string, path: string = NOAH_WAKE.path): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(key, 'sign'), wakeMessage(timestamp, path)));
}

/** 合図の検査。鍵が短い・時刻が 2 分より離れている・本文が '{}' でない・署名が違う、のどれでも偽。 */
export async function verifyNoahWake(input: { key: string | undefined; timestamp: string | null; signature: string | null; body: string; now: number; path?: string }): Promise<boolean> {
  const { key, timestamp, signature } = input;
  if (!key || key.length < NOAH_WAKE.minKeyChars || !timestamp || !/^\d{13}$/.test(timestamp) || !signature || !/^[a-f0-9]{64}$/.test(signature)) return false;
  if (Math.abs(input.now - Number(timestamp)) > NOAH_WAKE.maxSkewMs || input.body !== '{}') return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', await hmacKey(key, 'verify'), bytes, wakeMessage(timestamp, input.path ?? NOAH_WAKE.path));
}

/** 1 回の合図で進める量。数値は候補。配備先の上限（CPU・外向きの通信・D1 の query）の中に収まるように、本人が変える。 */
export const NOAH_PATROL_BUDGET = {
  /** 台帳の頁。手元の計測で、1 頁（100 件）の下書きと hash に CPU 約 27 ms。 */
  pages: 10,
  /** 握手する候補。1 件で外向きの通信が 4〜5 回。 */
  probes: 8,
  /** 握手を同時に行う数。Workers は、1 回の実行で同時に開ける外向きの接続が 6 本まで。 */
  concurrent: 4,
  /** 1 回の合図で使う時間の上限。 */
  seconds: 25,
};
