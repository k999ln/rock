import { createIntakeStore } from './noah-intake-store.ts';
import type { IntakeDependencies, IntakeOutcome } from './noah-intake-sync.ts';
import { noProbes, type IntakeProbeCounts } from './noah-intake-probe.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { verifyNoahWake } from './noah-intake-wake.ts';
import { createNoahLaunchStatus } from './noah-launch-status.ts';
import { createNoahSweep, noSweep, noahSweepTotal } from './noah-sweep.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
export type IntakeApiDependencies = IntakeDependencies & {
  authenticate: (request: Request) => Promise<string>; reviewers: string[]; flags: NoahFlags; wakeKey?: string;
  /** 棚の、載せるかの見直し（lib/noah-shelf-store.ts の recheckIfDue）。無ければ行わない。失敗しても、合図の結果は変えない。 */
  shelfRecheck?: () => Promise<unknown>;
  providerRecheck?: () => Promise<unknown>;
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const body = async (request: Request, limit: number) => new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, limit));
function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
  return json({ error: '台帳を確認できません。少し待ってから再試行してください。' }, 503);
}
export function createIntakeApi(deps: IntakeApiDependencies) {
  const store = createIntakeStore(deps), launch = createNoahLaunchStatus(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      try { owner = await deps.authenticate(request); } catch (error) { if (request.method !== 'GET' || !(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error; }
      const reviewer = !!owner && deps.reviewers.includes(owner), url = new URL(request.url);
      if (!noahAllowed(deps.flags, 'list', reviewer)) return json({ error: '見つかりません。' }, 404);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      if (request.method === 'GET') {
        // 運営の画面（審査者だけ）。launch は、見張る数（docs/noah/spec-97-launch-ops.md の 6 章）。数えられない時は null（取り込みの節の、他の行は出す）。
        if (url.searchParams.get('state') === '1') return reviewer ? json({ ...await store.status(url.searchParams), launch: await launch(deps.flags).catch(() => null), warnings: deps.flags.warnings, ownerScope }) : json({ error: '見つかりません。' }, 404);
        const id = url.searchParams.get('id');
        return json({ ...(id ? await store.detail(id, owner, reviewer) : await store.list(owner, url.searchParams)), ownerScope });
      }
      if (!reviewer || request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      const input: unknown = JSON.parse(await body(request, 1024));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NoahAgentError('入力形式を確認してください。');
      const value = input as Record<string, unknown>, keys = Object.keys(value);
      if (!keys.length) {
        if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return json({ error: '手元の巡回専用です。' }, 403);
        if (!deps.flags.patrol) return json({ disabled: true, ownerScope });
        return json({ outcomes: [await store.sync()], ownerScope });
      }
      if (keys.length !== 3 || !keys.every(k => ['action', 'id', 'revision'].includes(k)) || !['withdraw', 'restore'].includes(String(value.action)) || typeof value.id !== 'string' || value.id.length < 3 || value.id.length > 400 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) throw new NoahAgentError('操作・Agent・版を確認してください。');
      return json({ ...await store.moderate(value.action as 'withdraw' | 'restore', value.id, Number(value.revision)), ownerScope });
    } catch (error) { return failure(error); }
  };
}
export function createIntakeTick(deps: IntakeApiDependencies) {
  return async (request: Request) => {
    if (request.method !== 'POST') return json({ error: '対応しない操作です。' }, 405);
    if (request.headers.has('origin')) return json({ error: 'Forbidden' }, 403);
    let valid = false;
    try { valid = await verifyNoahWake({ key: deps.wakeKey, timestamp: request.headers.get('x-noah-time'), signature: request.headers.get('x-noah-signature'), body: await body(request, 2), now: (deps.now ?? Date.now)(), path: new URL(request.url).pathname }); } catch { /* Invalid or oversized wake: fail closed. */ }
    if (!valid) return json({ error: 'Unauthorized' }, 401);
    if (!deps.flags.patrol) return json({ disabled: true });
    // 1 回の合図で進める量（台帳の頁・握手の数・時間）は、環境変数 NOAH_PATROL_BUDGET で変えられる。
    const clock = deps.now ?? Date.now, started = clock(), budget = deps.budget ?? deps.flags.patrolBudget;
    const store = createIntakeStore({ ...deps, budget });
    let outcome: IntakeOutcome = { pages: 0, seen: 0, changed: 0, more: false, error: 'unavailable' }, probe: IntakeProbeCounts = noProbes(), thrown: unknown = null;
    try {
      // 台帳の巡回の後に、握手を行う。台帳を読めなかった時も、握手は行う（別の相手なので）。
      outcome = await store.sync();
      probe = await store.probeDue(started + budget.seconds * 1000);
    } catch (error) { thrown = error; }
    // 後始末（止まった依頼と、つなぐ途中で止まった接続）。台帳や握手が失敗した合図でも、行う（別の表の仕事。相手へは、何も送らない）。
    let swept = noSweep();
    try { swept = await createNoahSweep(deps)(); } catch (error) { thrown ??= error; }
    // Reconcile interrupted provider work; never reopen a Gradio stream or re-submit a call.
    if (deps.providerRecheck) try { await deps.providerRecheck(); } catch (error) { thrown ??= error; }
    // 棚の見直し（別の表の仕事。棚の表がまだ無い時も、巡回の結果に影響させない）。
    if (deps.shelfRecheck) try { await deps.shelfRecheck(); } catch { /* 棚は、次の合図で見直す。 */ }
    // 台帳を読めなかった・表を読み書きできなかった合図は、2xx にしない（合図を送る専用の Worker の実行が、失敗として残る。監視で、成功に見せない）。
    // 握手を 1 件でも試みた時は、その数を応答に足す（数だけ。接続先の名前は持たない）。後始末も、1 件でも片付けた時だけ、数を足す（誰の物かは持たない）。
    const attempted = probe.probes + probe.skippedHost > 0, sweptTotal = noahSweepTotal(swept);
    const response = thrown ? failure(thrown) : json({ ...outcome, ...(attempted ? { probe } : {}), ...(sweptTotal ? { swept } : {}) }, outcome.error ? 500 : 200);
    // 合図 1 回の記録（1 行）。数と理由の符号だけ。接続先の名前・URL・本人の ID は出さない。swept は、後始末で片付けた依頼と接続の数（合わせた数）。
    console.info(JSON.stringify({ event: 'noah-patrol', pages: outcome.pages, seen: outcome.seen, changed: outcome.changed, skipped: outcome.skipped ?? 0, probes: probe.probes, ok: probe.ok, authRequired: probe.authRequired, unreachable: probe.unreachable, rateLimited: probe.rateLimited, skippedHost: probe.skippedHost, toolsChanged: probe.toolsChanged, swept: sweptTotal, error: thrown ? 'unavailable' : outcome.error ?? null, ms: clock() - started }));
    return response;
  };
}
