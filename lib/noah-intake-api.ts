import { createIntakeStore } from './noah-intake-store.ts';
import type { IntakeDependencies, IntakeOutcome } from './noah-intake-sync.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { verifyNoahWake } from './noah-intake-wake.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
export type IntakeApiDependencies = IntakeDependencies & {
  authenticate: (request: Request) => Promise<string>; reviewers: string[]; flags: NoahFlags; wakeKey?: string;
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
  const store = createIntakeStore(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      try { owner = await deps.authenticate(request); } catch (error) { if (request.method !== 'GET' || !(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error; }
      const reviewer = !!owner && deps.reviewers.includes(owner), url = new URL(request.url);
      if (!noahAllowed(deps.flags, 'list', reviewer)) return json({ error: '見つかりません。' }, 404);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      if (request.method === 'GET') {
        if (url.searchParams.get('state') === '1') return reviewer ? json({ ...await store.status(url.searchParams), warnings: deps.flags.warnings, ownerScope }) : json({ error: '見つかりません。' }, 404);
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
    // 台帳を読めなかった・書けなかった巡回は、500 で返す（合図を送る専用の Worker の実行が、失敗として残る。監視で、成功に見せない）。
    const clock = deps.now ?? Date.now, started = clock();
    let outcome: IntakeOutcome = { pages: 0, seen: 0, changed: 0, more: false, error: 'unavailable' }, response: Response;
    try { outcome = await createIntakeStore(deps).sync(); response = json(outcome, outcome.error ? 500 : 200); } catch (error) { response = failure(error); }
    // 合図 1 回の記録（1 行）。数と理由の符号だけ。接続先の名前・URL・本人の ID は出さない。握手の数は、握手を作る層（L4）が入れる。
    console.info(JSON.stringify({ event: 'noah-patrol', pages: outcome.pages, seen: outcome.seen, changed: outcome.changed, skipped: outcome.skipped ?? 0, probes: 0, ok: 0, authRequired: 0, unreachable: 0, rateLimited: 0, skippedHost: 0, toolsChanged: 0, swept: 0, error: outcome.error ?? null, ms: clock() - started }));
    return response;
  };
}
