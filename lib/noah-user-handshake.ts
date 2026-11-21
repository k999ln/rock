/**
 * 利用者の操作から始める握手（接続・道具の一覧・依頼）。接続先の枠を 1 つ取ってから、相手のサーバーと握手する。
 *
 * - 1 つの接続先へは、全員合わせて 60 秒に決まった回数まで（flags.askLimits.hostHandshakes）。相手が「混んでいる」と返して待っている間は 0 回。
 *   枠が取れない時は、相手へ何も送らない。
 * - 握手は全体で 8 秒。別の接続先への転送には従わない（本人に見せた送り先の外へ送らない）。名乗りは Noah/1（巡回は NoahBot/1）。
 * - 相手が 401・402 を返したら、相手の作りが変わった事がはっきりしているので、その場で握手の表に書き、系列へ写す（一覧から外れる）。
 *   それ以外の失敗では、握手の表に書かない（1 人の失敗で、全員の一覧から外さない。外すかどうかは、巡回の握手だけで決める）。
 *   巡回が最後に握手した時刻（checked_at）は、書き換えない。
 * - 相手が 429 を返したら、Retry-After（無ければ 60 秒）の時刻まで、その接続先へは、巡回も、利用者の操作から始める握手も送らない。
 * 道具は呼ばない。道具を呼ぶのは、依頼を実行する側（握手の結果の session を使う）。
 * 仕様: docs/noah/spec-74-one-click-connect.md の 11.3、spec-87-tool-agent.md の 11.3・11.4。
 */
import { NOAH_HOST_BUSY } from './noah-form.ts';
import { intakeStatement } from './noah-intake-db.ts';
import { NOAH_LISTING_SQL } from './noah-intake-listing.ts';
import { NOAH_CHECK_COLUMNS, NOAH_PROBE_FAMILY, noahCheckState, noahFamilyWrites, type NoahCheckRow, type NoahProbeFamily } from './noah-intake-probe.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';
import { createNoahGuardedFetch, NoahMouthError, noahMcpClose, noahMcpHandshake, type NoahHandshake, type NoahMouthCode, type NoahMouthContext } from './noah-mouth-mcp-remote.ts';
import { planNoahProbeWrite } from './noah-probe.ts';

/** 握手の全体の待ち（初期化・通知・道具の一覧を合わせて）。実測は中央値 1.2 秒・9 割が 2.4 秒以内。数値は候補。 */
export const NOAH_USER_HANDSHAKE_MS = 8_000;

/** 握手が通らなかった時に、本人に見せる文（相手の応答ごと）。接続・道具の一覧・依頼で、同じ文を使う。 */
export const NOAH_HANDSHAKE_MESSAGES: Record<NoahMouthCode, string> = {
  auth_required: 'この Agent は、相手の許可が要るようになりました。まだ対応していません。',
  payment_required: 'この Agent は、呼ぶたびの支払いが要るようになりました。まだ対応していません。',
  forbidden: '相手のサーバーが、Noah からの接続を断りました。',
  rate_limited: '相手のサーバーが混んでいます。少し待ってから試してください。',
  unreachable: '相手のサーバーが応答しません。時間をおいて試してください。',
  incompatible: '相手のサーバーの応答を読めませんでした。',
  too_large: '相手のサーバーの応答を読めませんでした。',
  blocked: 'この接続先にはつなげません。',
};

export type NoahUserHandshakeTarget = {
  /** 握手の相手の候補（401・402 の時に、この候補の握手の記録を書く）。 */
  candidateId: string;
  /** 握手の元にした接続要件の hash。握手の間に、取り込みが接続要件を入れ替えていたら、握手の記録を書かない。 */
  connectSha256: string;
  url: string;
  host: string;
};
export type NoahUserHandshake =
  | {
      ok: true; handshake: NoahHandshake; ms: number;
      /** 握手の後の要求（道具の呼び出し）に使う。握手の待ち（8 秒）は付いていない。 */
      ctx: NoahMouthContext;
      /** セッションを閉じる。相手が対応していなくても失敗にしない。成果と状態を書き終えた後に呼ぶ。 */
      close: () => Promise<void>;
    }
  | { ok: false; code: NoahMouthCode | 'host_busy'; message: string };

export function createNoahUserHandshake(deps: IntakeDependencies & { hostHandshakes: number }) {
  const { db } = deps, now = deps.now ?? Date.now;
  const origin = new URL(deps.origin ?? 'https://avoado.si').origin;
  const prepare = (sql: string, ...args: (string | number | null)[]) => db.prepare(sql).bind(...args);
  // 接続先の検査を通した fetch。別の接続先への転送には従わない。
  const guarded = createNoahGuardedFetch(deps.fetcher ?? fetch, { sameHost: true, ...(deps.probeCheck ? { check: deps.probeCheck } : {}) });
  // 人の操作から始まった要求である事を、相手が見分けられるように名乗る。本人の名前・account・端末の情報は送らない。
  const headers = async () => ({ 'user-agent': `Noah/1 (+${origin}/noah/help#bot)` });

  /** 401・402: 握手の表の level を 0 にして、系列へ写す。checked_at は書き換えない。 */
  async function unlist(target: NoahUserHandshakeTarget, code: 'auth_required' | 'payment_required') {
    const row = await prepare(`SELECT ${NOAH_CHECK_COLUMNS} FROM noah_intake_checks WHERE candidate_id=? AND connect_sha256=?`, target.candidateId, target.connectSha256).first<NoahCheckRow>();
    const family = row ? await prepare(`${NOAH_PROBE_FAMILY}(?)`, target.candidateId).first<NoahProbeFamily>() : null;
    if (!row || !family) return;
    const at = now(), write = planNoahProbeWrite(noahCheckState(row), { ok: false, code }, { now: at, connected: false }), s = write.state;
    const written = await prepare('UPDATE noah_intake_checks SET level=?,result=?,auth=?,l1_at=?,l2_at=?,next_check_at=?,failures=?,first_failure_at=? WHERE candidate_id=? AND connect_sha256=?',
      s.level, s.result, s.auth, s.l1At, s.l2At, s.nextCheckAt, s.failures, s.firstFailureAt, target.candidateId, target.connectSha256).run();
    if (written.meta.changes !== 1) return;
    const copies = noahFamilyWrites(db, family, target.candidateId, write, at);
    if (copies.length) await db.batch(copies);
  }

  /** 接続先の枠を 1 つ取る。取れなければ false（相手へ、何も送らない）。 */
  async function take(host: string): Promise<boolean> {
    return (await intakeStatement(db, NOAH_LISTING_SQL.host_take, { host, now: now(), limit: deps.hostHandshakes }).first<{ user_count: number }>()) !== null;
  }

  /**
   * 相手が断った時の後始末（握手の時も、握手の後の道具の呼び出しの時も、同じ決まり）。理由の符号を返す。
   * 401・402 は、握手の表に書いて一覧から外す。429 は、相手が言った時刻まで待つ事を書く。それ以外は、何も書かない。
   */
  async function settle(target: NoahUserHandshakeTarget, error: unknown): Promise<NoahMouthCode> {
    // 口の外の失敗（応答の本文を読む途中で切れた、時間切れ）は「応答しない」に数える。
    const code: NoahMouthCode = error instanceof NoahMouthError ? error.code : 'unreachable';
    if (code === 'auth_required' || code === 'payment_required') await unlist(target, code);
    if (code === 'rate_limited') {
      const after = error instanceof NoahMouthError && typeof error.detail.retryAfterSeconds === 'number' ? error.detail.retryAfterSeconds : 60;
      await intakeStatement(db, NOAH_LISTING_SQL.host_wait, { host: target.host, until: now() + Math.max(1, after) * 1000 }).run();
    }
    return code;
  }

  /**
   * 接続先の枠を取り、握手する。失敗は、理由の符号と、本人に見せる文にして返す（投げない）。
   * `slotTaken`: 枠を、先に取ってある（依頼は、受け付ける前に `take` で取る。握手で、もう 1 つ取らない）。
   */
  async function handshake(target: NoahUserHandshakeTarget, options: { slotTaken?: boolean } = {}): Promise<NoahUserHandshake> {
    if (!options.slotTaken && !(await take(target.host))) return { ok: false, code: 'host_busy', message: NOAH_HOST_BUSY };
    const ctx: NoahMouthContext = { fetch: guarded, headers };
    const started = now();
    try {
      const result = await noahMcpHandshake(target.url, { ...ctx, signal: AbortSignal.timeout(NOAH_USER_HANDSHAKE_MS) });
      return { ok: true, handshake: result, ms: Math.max(0, now() - started), ctx, close: () => noahMcpClose(result.session, ctx) };
    } catch (error) {
      const code = await settle(target, error);
      return { ok: false, code, message: NOAH_HANDSHAKE_MESSAGES[code] };
    }
  }

  return { handshake, take, settle };
}
