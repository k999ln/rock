import { createDiscoveryStore } from './noah-discovery-store.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
export function createDiscoveryApi(deps: {
  db: Pick<D1Database, 'prepare' | 'batch'>;
  authenticate: (r: Request) => Promise<string>;
  now?: () => number;
  fetcher?: typeof fetch;
  publicTags?: (id:string)=>string[];
}) {
  const store = createDiscoveryStore(deps);
  return async (request: Request, id?: string) => {
    try {
      let owner: string | null = null;
      try {
        owner = await deps.authenticate(request);
      } catch (e) {
        if (
          request.method !== 'GET' ||
          !(e instanceof Error && e.message === 'UNAUTHORIZED')
        )
          throw e;
      }
      const ownerScope = owner ? await ownerScopeFor(owner) : null,
        url = new URL(request.url);
      if (request.method === 'GET')
        return json({
          ...(id
            ? { candidate: await store.detail(id) }
            : url.searchParams.get('state') === '1'
              ? { sources: await store.status() }
              : await store.list(owner, url.searchParams)),
          ownerScope,
        });
      if (request.method !== 'POST' || id)
        return json({ error: '対応しない操作です。' }, 405);
      if (!owner || request.headers.get('origin') !== url.origin)
        throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope)
        throw new NoahAgentError(
          'アカウントが変わりました。再読込してください。',
          409,
        );
      if (!request.headers.get('content-type')?.startsWith('application/json'))
        throw new NoahAgentError('JSONで操作してください。', 415);
      const input = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedNoahBody(request, 128),
        ),
      );
      if (
        !input ||
        Array.isArray(input) ||
        typeof input !== 'object' ||
        Object.keys(input).length
      )
        throw new NoahAgentError('取得先や取得時刻は指定できません。');
      return json({
        outcomes: await store.sync(),
        sources: await store.status(),
        ownerScope,
      });
    } catch (e) {
      if (e instanceof NoahAgentError)
        return json({ error: e.message }, e.status);
      if (e instanceof Error && e.message === 'UNAUTHORIZED')
        return json({ error: 'サインインして新着を確認してください。' }, 401);
      if (e instanceof SyntaxError)
        return json({ error: '入力形式を確認してください。' }, 400);
      return json(
        { error: '公開ソースの候補を確認できません。再試行してください。' },
        503,
      );
    }
  };
}
