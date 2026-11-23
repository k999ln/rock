/**
 * Noah の握手までの接続試験（L1）: 相手のサーバーへ握手して道具の一覧を読み、その結果を「握手の表に書く値」へ直す。
 *
 * 道具は呼ばない。道具の定義そのものは持ち帰らない（hash と数だけ）。相手の許可（OAuth）の公開情報も探さない。
 * 通信は、呼ぶ側が渡す ctx.fetch だけを使う（検査済みの fetch を渡す。lib/noah-mouth-mcp-remote.ts の createNoahGuardedFetch）。
 * 表への読み書きは lib/noah-intake-probe.ts。ここは、握手 1 回と、純関数だけ。
 * 仕様: docs/noah/spec-86-remote-mouth.md の 4.2・10.3、spec-88-mass-probe.md の 9.3・9.4。
 */
import { noahFormSummary } from './noah-form.ts';
import { NoahMouthError, noahMcpClose, noahMcpHandshake, type NoahHandshakeSnapshot, type NoahMcpSession, type NoahMouthCode, type NoahMouthContext } from './noah-mouth-mcp-remote.ts';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** 次に確かめるまでの間隔。数値は候補。docs/contracts/noah-intake-v1.ts から移した（MVP L4）。 */
export const NOAH_CHECK_INTERVALS = { connected: 24 * HOUR, level2: 72 * HOUR, level1: 168 * HOUR, retry: 6 * HOUR, hideAfter: 30 * 24 * HOUR };
/** 握手が続けて何回失敗したら、一覧から外すか（level を 0 にする）。1 回の失敗では外さない。 */
export const NOAH_FAILURES_TO_UNLIST = 2;
/**
 * 次に確かめる時刻。つないでいる人がいる系列は 24 時間後、L2 だけは 3 日後、L1 以下は 7 日後。
 * 1 回目の失敗の後は、6 時間後に確かめ直す（止まった物を、何日も並べたままにしない）。
 * 2 回目からは、間隔を 2 倍ずつ伸ばす（最長 30 日）。hide は、最初の失敗から 30 日たったら真。
 */
export function nextNoahCheck(input: { now: number; connected: boolean; level: 0 | 1 | 2; failures: number; firstFailureAt: number | null }): { at: number; hide: boolean } {
  const base = input.connected ? NOAH_CHECK_INTERVALS.connected : input.level === 2 ? NOAH_CHECK_INTERVALS.level2 : NOAH_CHECK_INTERVALS.level1;
  const interval = input.failures === 1 ? NOAH_CHECK_INTERVALS.retry : Math.min(base * 2 ** Math.min(Math.max(input.failures - 1, 0), 10), NOAH_CHECK_INTERVALS.hideAfter);
  return { at: input.now + interval, hide: input.firstFailureAt !== null && input.now - input.firstFailureAt >= NOAH_CHECK_INTERVALS.hideAfter };
}

/** 巡回での握手の数値。候補。 */
export const NOAH_PROBE = {
  /** 握手 1 件の全体の待ち（初期化・通知・一覧・閉じるを合わせて）。 */
  timeoutMs: 12_000,
  /** 同じ接続先へ、巡回が握手する間隔。 */
  hostEveryMs: HOUR,
  /** 握手の対象でない候補（量産の系列・取り下げた系列）と、相手の許可・支払いが要る・大きすぎる・別の接続先へ回す、の後に確かめ直すまで。 */
  laterMs: 30 * DAY,
  /** 握手の表の取り置き（2 つの合図が、同じ候補を取らない）。 */
  leaseMs: 60_000,
  /** 確かめ直さない（接続先が検査を通らない。台帳の記録が変われば、取り込みが握手の記録を消して、確かめ直す）。9999 年。 */
  never: 253_402_300_799_000,
};

export type NoahProbeOutcome =
  | { ok: true; toolsSha256: string; toolCount: number; readOnly: boolean; formTools: number; oneTapTools: number; latencyMs: number }
  | { ok: false; code: NoahMouthCode; retryAfterSeconds?: number; redirected?: true };

/**
 * 握手 1 回。握手 → 初期化の通知 → 道具の一覧 → セッションを閉じる。**道具は呼ばない。**
 * 401 を受けても、相手の許可の公開情報は探さない（ローンチでは、要求は初期化の 1 回だけで終わる）。
 * 失敗は、理由の符号にして返す（投げない）。全体の待ちは NOAH_PROBE.timeoutMs まで。
 */
/**
 * Optional observer for the successful handshake metadata.  The probe result
 * deliberately remains the old summary shape; the intake layer holds this
 * snapshot in memory until the checks transaction commits.
 */
export type NoahProbeSuccessObserver = (handshake: NoahHandshakeSnapshot) => void;
export async function probeL1(url: string, ctx: NoahMouthContext, clock: () => number = Date.now, onSuccess?: NoahProbeSuccessObserver): Promise<NoahProbeOutcome> {
  const overall = AbortSignal.timeout(NOAH_PROBE.timeoutMs);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, overall]) : overall;
  const started = clock();
  let session: NoahMcpSession | null = null;
  try {
    const handshake = await noahMcpHandshake(url, { ...ctx, signal });
    session = handshake.session;
    // Observers are advisory and must never turn a successful handshake into
    // an unreachable result.  createIntakeProbe uses this only to retain the
    // definitions until the representative row is durably committed.
    try { onSuccess?.(handshake); } catch { /* capture is post-commit work */ }
    const { formTools, oneTapTools } = noahFormSummary(handshake.tools);
    return { ok: true, toolsSha256: handshake.toolsSha256, toolCount: handshake.tools.length, readOnly: handshake.allReadOnly, formTools, oneTapTools, latencyMs: Math.max(0, clock() - started) };
  } catch (error) {
    // 口の外の失敗（応答の本文を読む途中で切れた、時間切れ）は「応答しない」に数える。
    if (!(error instanceof NoahMouthError)) return { ok: false, code: 'unreachable' };
    const retry = typeof error.detail.retryAfterSeconds === 'number' ? { retryAfterSeconds: error.detail.retryAfterSeconds } : {};
    return { ok: false, code: error.code, ...retry, ...(typeof error.detail.redirectedTo === 'string' ? { redirected: true as const } : {}) };
  } finally {
    // 閉じる要求も、全体の待ちの中に収める。相手が対応していなくてもよい。
    if (session) await noahMcpClose(session, { ...ctx, fetch: ((input, init) => ctx.fetch(input, { ...init, signal: init?.signal ? AbortSignal.any([init.signal, signal]) : signal })) as typeof fetch });
  }
}

type Auth = 'none' | 'oauth' | 'key' | 'payment' | 'unknown';
type Result = 'unchecked' | 'ok' | 'auth_required' | 'payment_required' | 'forbidden' | 'rate_limited' | 'unreachable' | 'incompatible' | 'too_large' | 'blocked';
/** 握手の表（noah_intake_checks）の、握手が書く列。 */
export type NoahCheckState = {
  level: 0 | 1 | 2; result: Result; auth: Auth;
  toolsSha256: string | null; toolCount: number | null; readOnly: boolean | null; formTools: number | null; oneTapTools: number | null;
  latencyMs: number | null; checkedAt: number | null; l1At: number | null; l2At: number | null;
  nextCheckAt: number; failures: number; firstFailureAt: number | null;
};
export type NoahProbeWrite = {
  state: NoahCheckState;
  /** 道具の定義の hash が、前の握手と違った（最初の握手は数えない）。level は変えない。 */
  toolsChanged: boolean;
  /** 最初の失敗から 30 日たった。その候補が代表の系列を隠す。 */
  hide: boolean;
  /** 相手が応答した（失敗が続いていない）。隠していた系列を戻す。 */
  unhide: boolean;
  /** 相手が「混んでいる」と返した。この時刻まで、その接続先へ、巡回も利用者の操作も送らない。 */
  hostWaitUntil: number | null;
};

/**
 * 握手の結果を、握手の表に書く値へ直す（純関数）。spec-86 の 4.2 の表を、10.3 の 4〜6 と spec-88 の 9.3・9.4 で読み替えた物:
 * - 通った: level は 1（「動いた」の物は 2 のまま）。道具の定義の hash が変わっても、level は変えない。
 * - 相手が応答したが使えない（道具が 0 個・401・402・403・形が合わない・大きすぎる）: その場で level 0。失敗の数は 0 に戻す。
 * - 応答しない: 失敗を 1 増やす。1 回目は level をそのままにして、6 時間後に確かめ直す。2 回続いたら level 0。
 * - 混んでいる（429）: 失敗に数えない。level も変えない。相手が言った時刻の後に確かめ直す。
 * level が 0 になる時は、その段になった時刻（l1At・l2At）を消す。「動いた」は、人が動かすまで戻らない。
 */
export function planNoahProbeWrite(previous: NoahCheckState, outcome: NoahProbeOutcome, input: { now: number; connected: boolean }): NoahProbeWrite {
  const { now, connected } = input;
  const base = { ...previous, checkedAt: now };
  const down = { level: 0 as const, l1At: null, l2At: null };
  const responded = { failures: 0, firstFailureAt: null };
  const done = (state: NoahCheckState, extra: Partial<Omit<NoahProbeWrite, 'state'>> = {}): NoahProbeWrite => ({ state, toolsChanged: false, hide: false, unhide: state.firstFailureAt === null, hostWaitUntil: null, ...extra });

  if (outcome.ok) {
    const tools = { toolsSha256: outcome.toolsSha256, toolCount: outcome.toolCount, readOnly: outcome.readOnly, formTools: outcome.formTools, oneTapTools: outcome.oneTapTools, latencyMs: outcome.latencyMs };
    const toolsChanged = previous.toolsSha256 !== null && previous.toolsSha256 !== outcome.toolsSha256;
    // 道具が 1 つも無い接続先は、頼める事が無い。
    if (outcome.toolCount < 1) return done({ ...base, ...tools, ...down, ...responded, result: 'incompatible', auth: 'none', nextCheckAt: now + NOAH_CHECK_INTERVALS.level1 }, { toolsChanged });
    const level = previous.level === 2 && previous.l2At !== null ? 2 : 1;
    return done({
      ...base, ...tools, ...responded, level, result: 'ok', auth: 'none',
      l1At: previous.level >= 1 && previous.l1At !== null ? previous.l1At : now, l2At: level === 2 ? previous.l2At : null,
      nextCheckAt: nextNoahCheck({ now, connected, level, failures: 0, firstFailureAt: null }).at,
    }, { toolsChanged });
  }
  switch (outcome.code) {
    case 'rate_limited': {
      const until = now + Math.max(1, outcome.retryAfterSeconds ?? 60) * 1000;
      return done({ ...base, result: 'rate_limited', nextCheckAt: until }, { hostWaitUntil: until, unhide: false });
    }
    case 'unreachable': {
      const failures = previous.failures + 1, firstFailureAt = previous.firstFailureAt ?? now;
      const level = failures >= NOAH_FAILURES_TO_UNLIST ? 0 : previous.level;
      const next = nextNoahCheck({ now, connected, level, failures, firstFailureAt });
      return done({ ...base, ...(level === 0 ? down : {}), level, result: 'unreachable', failures, firstFailureAt, nextCheckAt: next.at }, { hide: next.hide, unhide: false });
    }
    // 相手の許可か鍵かは、公開情報を探さないと分からない。ローンチでは探さないので、分からないまま置く。
    case 'auth_required': return done({ ...base, ...down, ...responded, result: 'auth_required', auth: 'unknown', nextCheckAt: now + NOAH_PROBE.laterMs });
    case 'payment_required': return done({ ...base, ...down, ...responded, result: 'payment_required', auth: 'payment', nextCheckAt: now + NOAH_PROBE.laterMs });
    case 'forbidden': return done({ ...base, ...down, ...responded, result: 'forbidden', auth: 'unknown', nextCheckAt: now + NOAH_CHECK_INTERVALS.level1 });
    case 'incompatible': return done({ ...base, ...down, ...responded, result: 'incompatible', nextCheckAt: now + NOAH_CHECK_INTERVALS.level1 });
    case 'too_large': return done({ ...base, ...down, ...responded, result: 'too_large', nextCheckAt: now + NOAH_PROBE.laterMs });
    // 別の接続先へ回す相手は、やめる事がある（30 日後に確かめ直す）。検査を通らない接続先は、記録が変わるまで確かめ直さない。
    case 'blocked': return done({ ...base, ...down, ...responded, result: 'blocked', nextCheckAt: outcome.redirected ? now + NOAH_PROBE.laterMs : NOAH_PROBE.never });
  }
}
