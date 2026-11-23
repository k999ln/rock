/**
 * ブラウザだけの本人（Cookie の保存先、`noah-browser:`）の書き込みに、Noah 全体の 1 日の上限を掛ける。
 * task 128 の D1・使い勝手と抜け道の確かめの S1（2026-11-22）。
 *
 * ブラウザだけの本人は、Cookie を捨てるだけで何人でも作れる。だから本人ごとの上限（依頼 1 日 200 回・
 * 下書き 64MiB・Agent 100 件など）だけでは、D1（10GB まで）と R2 が際限なく増える。ここで、
 * ブラウザだけの本人を全員まとめた 1 日の量を数え、越えた書き込みを断る。サインインした本人は数えない。
 *
 * 新しい表は作らない（本番 D1 への migration は本人の許可が要る。AGENTS.md の 6）。数は、
 * アカウントの回数表 `rockstar_account_rate_limits(request_key, window, attempts)` に、
 * request_key = `noah-quota:<種類>`、window = その日（UTC）の終わりの分 で持つ。
 * アカウントの側の掃除（`DELETE … WHERE window < 今の分 − 10`。lib/rockstar-account.ts・lib/rockstar-password.ts）は、
 * 日が終わって 10 分たつと、この行も消す。日の途中では消さない（window が今の分より大きいので）。
 *
 * 数えるのと書くのを 1 つの文にする（条件つきの upsert）。同時に来ても、上限を越えて数えない。
 * 断った時は 1 も足さない。足した後で本体の書き込みが失敗しても、戻さない（多めに数えるだけ）。
 */
type Db = Pick<D1Database, 'prepare'>;

/** 1 日（UTC）に、ブラウザだけの本人を全員まとめて、受け付ける量。数値は候補（本人が変える）。 */
export const NOAH_BROWSER_DAILY = {
  /** 依頼（noah_asks と work_jobs の行）。 */
  asks: 10_000,
  /** 新しい接続（noah_connections の行と、相手への握手）。 */
  connections: 5_000,
  /** 自分の Agent の登録（noah_agent_uploads の行）。 */
  agents: 500,
  /** 下書きのファイル（noah_draft_objects の行と R2 の物）。 */
  draftObjects: 10_000,
  /** 下書きのファイルと、登録した Agent のコードの、R2 に置くバイト数。 */
  uploadBytes: 4 * 1024 ** 3,
  /** GitHub・Hugging Face からのコードの取り込み（Noah の外向きの IP で、相手の API の枠を使う）。 */
  imports: 300,
} as const;
export type NoahBrowserQuotaKind = keyof typeof NOAH_BROWSER_DAILY;

export const NOAH_BROWSER_QUOTA_MESSAGE = '今日は、ブラウザだけの保存先からの受付が、Noah 全体の上限に達しました。時間をおいて（日本時間の 9 時を過ぎてから）、また試してください。';

export const noahBrowserOwner = (owner: string) => owner.startsWith('noah-browser:');

/** その日（UTC）の終わりの分。アカウントの回数表の window と同じ単位（分）。 */
export const noahQuotaWindow = (now: number) => (Math.floor(now / 86_400_000) + 1) * 1440;

export function createNoahBrowserQuota(db: Db, now: () => number = Date.now, limits: Record<NoahBrowserQuotaKind, number> = NOAH_BROWSER_DAILY) {
  return {
    /** 足せたら true。サインインした本人は、数えずに true。 */
    async take(owner: string, kind: NoahBrowserQuotaKind, amount = 1): Promise<boolean> {
      if (!noahBrowserOwner(owner)) return true;
      const cap = limits[kind];
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > cap) return false;
      try {
        const row = await db.prepare(`INSERT INTO rockstar_account_rate_limits(request_key, window, attempts)
          SELECT ?, ?, ? WHERE ? <= ?
          ON CONFLICT(request_key, window) DO UPDATE SET attempts = attempts + excluded.attempts
          WHERE rockstar_account_rate_limits.attempts + excluded.attempts <= ?
          RETURNING attempts`)
          .bind(`noah-quota:${kind}`, noahQuotaWindow(now()), amount, amount, cap, cap)
          .first<{ attempts: number }>();
        return row !== null;
      } catch (error) {
        // アカウントの表が無い D1（Noah の表だけで作った試験の世界・別の Sites の D1）では、上限を掛けずに通す。
        // 上限のために Noah の本体（依頼・接続・保存）を止めない。本番の D1 には、この表がある（drizzle の 0021・0028・0031）。
        // ほかの失敗（D1 につながらない等）は、そのまま投げる（本体の書き込みも、どうせ通らない）。
        if (error instanceof Error && /no such table: rockstar_account_rate_limits/i.test(error.message)) return true;
        throw error;
      }
    },
  };
}
