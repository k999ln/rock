/**
 * Noah 取り込みの入口: 一覧・検索・詳細（サインイン不要）、運営の集計と取り下げ（審査者だけ）、巡回の合図。
 *
 * 見せてよいかは、切り替え（lib/noah-flags.ts）と審査者かどうかで決める。閉じている間は、無い物として 404 を返す。
 * 系列の ID は `/` と `:` を含むので、URL のパスに入れず、いつも query（?id=）か本文で受ける。
 * 仕様: docs/noah/spec-85-intake.md 11.3・11.5。
 */
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { createIntakeStore, NOAH_INTAKE } from './noah-intake-store.ts';
import { verifyNoahWake } from './noah-intake-wake.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from './owner-intent.ts';

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const notFound = () => json({ error: '見つかりません。' }, 404);

/** 巡回が外へ名乗る文字列。説明の頁（/noah/help#bot）を添える。 */
export const noahBotUserAgent = (origin: string) => `NoahBot/1 (+${origin}/noah/help#bot)`;

export type NoahIntakeApiDeps = {
  db: Pick<D1Database, 'prepare' | 'batch'>;
  authenticate: (request: Request) => Promise<string>;
  /** 審査者（NOAH_REVIEWER_USER_IDS）。切り替えが閉じていても使える。 */
  reviewers: string[];
  flags: NoahFlags;
  /** 巡回の合図の鍵（NOAH_PATROL_WAKE_KEY）。置いていなければ、誰の合図も通さない。 */
  wakeKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  /** 合図 1 回の記録を出す先。既定は console.info。接続先の名前・URL・本人の ID は出さない。 */
  log?: (line: string) => void;
};

export function createIntakeApi(deps: NoahIntakeApiDeps) {
  const now = deps.now ?? Date.now;
  const storeFor = (request: Request) =>
    createIntakeStore({ db: deps.db, now, fetcher: deps.fetcher, budget: deps.flags.patrolBudget, userAgent: noahBotUserAgent(new URL(request.url).origin) });

  async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      let owner: string | null = null;
      try {
        owner = await deps.authenticate(request);
      } catch (error) {
        // 読むだけなら、サインインは要らない。
        if (request.method !== 'GET' || !(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error;
      }
      const reviewer = owner !== null && deps.reviewers.includes(owner);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      const store = storeFor(request);
      if (request.method === 'GET') {
        if (!noahAllowed(deps.flags, 'list', reviewer)) return notFound();
        const viewer = { signedIn: owner !== null, reviewer };
        if (url.searchParams.get('state') === '1') {
          if (!reviewer) return notFound();
          return json({ ...(await store.status()), warnings: deps.flags.warnings, ownerScope });
        }
        const id = url.searchParams.get('id');
        if (id !== null) return json({ agent: await store.detail(id, viewer), source: NOAH_INTAKE.sourceLabel, ownerScope });
        return json({ ...(await store.list(url.searchParams, viewer)), ownerScope });
      }
      if (request.method !== 'POST') return json({ error: '対応しない操作です。' }, 405);
      if (!owner || request.headers.get('origin') !== url.origin) throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) throw new NoahAgentError('アカウントが変わりました。再読込してください。', 409);
      if (!reviewer) throw new NoahAgentError('審査担当者としてサインインしてください。', 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。', 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 2048)));
      if (!input || Array.isArray(input) || typeof input !== 'object') throw new NoahAgentError('入力形式を確認してください。');
      const body = input as Record<string, unknown>;
      const keys = Object.keys(body).sort();
      if (!keys.length) {
        // 手元の巡回用（本番は、専用の Worker の合図）。取得先や取得時刻は指定できない。巡回を閉じている間は、何もしない。
        if (!deps.flags.patrol) return json({ disabled: true, ownerScope });
        const result = await store.sync();
        return json({ ...result, sources: (await store.status()).sources, ownerScope });
      }
      if (keys.join() !== 'action,id,revision' || (body.action !== 'withdraw' && body.action !== 'restore') || typeof body.id !== 'string' || typeof body.revision !== 'number')
        throw new NoahAgentError('入力を確かめてください。');
      const family = body.action === 'withdraw' ? await store.withdraw(body.id, body.revision) : await store.restore(body.id, body.revision);
      return json({ family, ownerScope });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインして操作してください。' }, 401);
      if (error instanceof SyntaxError || error instanceof TypeError) return json({ error: '入力形式を確認してください。' }, 400);
      return json({ error: '取り込みの状態を確かめられません。再試行してください。' }, 503);
    }
  }

  /**
   * 巡回の合図（POST だけ）。合図は「起きて」だけを伝える。何を読むか・どこへつなぐかは、ここ（Web の本体）だけが決める。
   * 応答は件数だけ。失敗は 500 にして、合図を送った側の実行を失敗として残す（成功に見せない）。
   */
  async function tick(request: Request): Promise<Response> {
    if (request.method !== 'POST') return json({ error: '対応しない操作です。' }, 405);
    // 画面から呼ぶ入口ではない。
    if (request.headers.has('origin')) return json({ error: 'Forbidden' }, 403);
    let body: string;
    try {
      body = new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 64));
    } catch {
      return json({ error: 'Unauthorized' }, 401);
    }
    const allowed = await verifyNoahWake({ key: deps.wakeKey, timestamp: request.headers.get('x-noah-time'), signature: request.headers.get('x-noah-signature'), body, now: now() });
    if (!allowed) return json({ error: 'Unauthorized' }, 401);
    if (!deps.flags.patrol) return json({ disabled: true });
    const started = now();
    const record = (fields: { pages: number; seen: number; changed: number }) =>
      (deps.log ?? console.info)(
        JSON.stringify({ event: 'noah-patrol', ...fields, probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0, swept: 0, ms: Math.max(0, now() - started) }),
      );
    try {
      const outcome = (await storeFor(request).sync({ deadline: started + deps.flags.patrolBudget.seconds * 1000 })).outcomes[0];
      const counts = { pages: outcome?.pages ?? 0, seen: outcome?.seen ?? 0, changed: outcome?.changed ?? 0 };
      record(counts);
      // 他の合図が先に進めていた時（取り合い）は、失敗にしない。
      if (outcome?.error && outcome.error !== 'lease_lost') return json({ error: outcome.error, ...counts }, 500);
      return json({ ...counts, more: outcome?.more ?? false });
    } catch {
      record({ pages: 0, seen: 0, changed: 0 });
      return json({ error: 'unavailable' }, 500);
    }
  }

  return { handle, tick };
}
