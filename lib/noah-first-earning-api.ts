import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { noahFirstEarningStore } from './noah-first-earning.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor, readOwnerScope } from './owner-intent.ts';

const respond = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization', 'X-Content-Type-Options': 'nosniff' },
});

export function createNoahFirstEarningApi(deps: {
  db: Pick<D1Database, 'prepare'>;
  authenticate: (request: Request) => Promise<string>;
  reviewers: string[];
  open: boolean;
  now?: () => number;
}) {
  const store = noahFirstEarningStore(deps.db);
  return async (request: Request) => {
    if (!deps.open) return respond({ error: '初回の売上の受付は準備中です。' }, 404);
    try {
      const owner = await deps.authenticate(request);
      if (owner.startsWith('noah-browser:')) throw Error('UNAUTHORIZED');
      const ownerScope = await ownerScopeFor(owner);
      const reviewer = deps.reviewers.includes(owner);
      const url = new URL(request.url);
      if (request.method === 'GET') {
        const target = url.searchParams.get('scope');
        if (target !== null && (!reviewer || !readOwnerScope(target))) return respond({ error: '確認する利用者が見つかりません。' }, 404);
        return respond({ ownerScope, reviewer, firstEarning: await store.status(target ?? ownerScope) });
      }
      if (request.method !== 'POST') return respond({ error: '対応しない操作です。' }, 405);
      if (request.headers.get('origin') !== url.origin || request.headers.get('sec-fetch-site') === 'cross-site') return respond({ error: 'Noahの画面から操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return respond({ error: 'アカウントが変わりました。画面を読み直してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({ error: '入力形式を確認してください。' }, 415);
      const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 4096)));
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new NoahAgentError('入力形式を確認してください。');
      const input = data as Record<string, unknown>;
      const now = (deps.now ?? Date.now)();
      const review = input.scope !== undefined;
      const target = review ? readOwnerScope(input.scope) : ownerScope;
      if (!target || (review && !reviewer)) return respond({ error: 'この操作は利用できません。' }, 403);
      if (input.action === 'enroll' && review) await store.enroll(target, ownerScope, now);
      else if (typeof input.action === 'string') await store.transition(target, ownerScope, review, input.action, input, now);
      else throw new NoahAgentError('操作を確認してください。');
      return respond({ ownerScope, reviewer, firstEarning: await store.status(target) });
    } catch (error) {
      if (error instanceof NoahAgentError) return respond({ error: error.message }, error.status);
      if (error instanceof SyntaxError || error instanceof TypeError) return respond({ error: '入力形式を確認してください。' }, 400);
      if (error instanceof Error && error.message === 'UNAUTHORIZED') return respond({ error: 'サインインしてください。' }, 401);
      return respond({ error: '進捗を確認できませんでした。再度お試しください。' }, 503);
    }
  };
}
