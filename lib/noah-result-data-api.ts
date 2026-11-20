import { createNoahDataStore, noahDataOperatorAllowed } from './noah-result-data.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
export type NoahDataDependencies = { db: Pick<D1Database, 'prepare'>; authenticate: (request: Request) => Promise<string>; operators?: string; now?: () => number };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
export function createNoahDataApi(deps: NoahDataDependencies) {
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      const owner = await deps.authenticate(request), ownerScope = await ownerScopeFor(owner);
      const url = new URL(request.url), operatorAllowed = noahDataOperatorAllowed(owner, deps.operators);
      // GET requests from an open workspace also pin its account, including downloads.
      if ((request.method === 'POST' || request.headers.has(OWNER_SCOPE_HEADER)) && request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      const store = createNoahDataStore(deps.db, deps.now);
      if (request.method === 'GET') {
        const view = url.searchParams.get('view') ?? 'personal';
        if (!['personal', 'operator'].includes(view)) return json({ error: '表示する成果を選び直してください。' }, 400);
        const operator = view === 'operator';
        if (operator && !operatorAllowed) return json({ error: 'この成果を閲覧する権限がありません。' }, 403);
        const id = url.searchParams.get('id');
        return json({ ...(id ? { detail: await store.detail(owner, id, operator) } : await store.list(owner, url.searchParams, operator)), ownerScope, operatorAllowed });
      }
      if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'JSONで操作してください。' }, 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 8192)));
      return json({ contribution: await store.mutate(owner, input), ownerScope, operatorAllowed });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
      return json({ error: '成果を確認できません。接続を確認して再試行してください。' }, 503);
    }
  };
}
