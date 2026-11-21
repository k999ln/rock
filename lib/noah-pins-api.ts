/**
 * ピンタレスト風の一覧の入口（task 115）。
 * GET /api/noah/pins: 一覧の 1 頁（?cursor=）。?related=<系列の ID> で「これも使われています」。サインイン不要（保存の印は、サインインした本人の分だけ）。
 * GET /api/noah/boards: 本人のボードとフォロー中のボード（サインイン）。?id=<ボード> で 1 つのボード（持ち主か、公開のボード。?cursor=）。?pin=<系列の ID> で、その Agent を保存している本人のボード。
 * POST /api/noah/boards: サインインした本人の操作（create・update・remove・save・unsave・follow・unfollow・hide・unhide）。
 * 見せてよいかは、取り込んだ一覧と同じ（切り替え NOAH_INTAKE_PUBLIC。閉じていても審査者は使える）。閉じている間は 404（画面は、今のタイムラインのまま）。
 * 書き込みの検査は、ほかの Noah の入口と同じ（同じ Origin・account の印・JSON・本文の大きさ）。実績の数え直し（1 日 1 回）は、一覧を返した後に行う。
 * 仕様: docs/noah/spec-115-pin-grid.md の 6 章。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { createNoahBoardsStore, type BoardsDependencies } from './noah-boards-store.ts';
import { noahBoardName, noahBoardVisibility } from './noah-pins.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';

export type PinsApiDependencies = BoardsDependencies & {
  authenticate: (request: Request) => Promise<string>; reviewers: string[]; flags: NoahFlags;
  waitUntil?: (work: Promise<unknown>) => void;
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: '同じNoahから操作してください。' }, 403);
  return json({ error: '一覧を確認できません。少し待ってから再試行してください。' }, 503);
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const FAMILY = /^[\x21-\x7e]{3,400}$/u;
const boardIdOf = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) throw new NoahAgentError('ボードの ID を確認してください。'); return value; };
const familyIdOf = (value: unknown) => { if (typeof value !== 'string' || !FAMILY.test(value)) throw new NoahAgentError('Agent の ID を確認してください。'); return value; };
const revisionOf = (value: unknown) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new NoahAgentError('版を確認してください。'); return value; };
const exactly = (value: Record<string, unknown>, keys: string[]) => {
  const got = Object.keys(value);
  if (got.length !== keys.length || !got.every((key) => keys.includes(key))) throw new NoahAgentError('操作の項目を確認してください。');
};

/** 本人を読む。未サインインは null（UNAUTHORIZED だけを未サインインとし、ほかの失敗はそのまま投げる）。 */
async function viewerOf(deps: PinsApiDependencies, request: Request) {
  try { return await deps.authenticate(request); } catch (error) { if (error instanceof Error && error.message === 'UNAUTHORIZED') return null; throw error; }
}

export function createNoahPinsApi(deps: PinsApiDependencies) {
  const store = createNoahBoardsStore(deps);
  return async (request: Request) => {
    try {
      if (request.method !== 'GET') return json({ error: '対応しない操作です。' }, 405);
      const owner = await viewerOf(deps, request), reviewer = !!owner && deps.reviewers.includes(owner);
      if (!noahAllowed(deps.flags, 'list', reviewer)) return json({ error: '見つかりません。' }, 404);
      const url = new URL(request.url), ownerScope = owner ? await ownerScopeFor(owner) : null;
      const related = url.searchParams.get('related');
      if (related !== null) return json({ items: await store.related(familyIdOf(related), owner), ownerScope });
      const page = await store.feed(owner, url.searchParams.get('cursor'));
      // 成果が返った人の数の数え直し（UTC の 1 日に 1 回）。応答の後に行い、失敗しても一覧は返す。
      const work = store.rollupIfDue().catch(() => undefined);
      if (deps.waitUntil) deps.waitUntil(work); else await work;
      return json({ ...page, ownerScope });
    } catch (error) { return failure(error); }
  };
}

export function createNoahBoardsApi(deps: PinsApiDependencies) {
  const store = createNoahBoardsStore(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      const owner = await viewerOf(deps, request), reviewer = !!owner && deps.reviewers.includes(owner);
      if (!noahAllowed(deps.flags, 'list', reviewer)) return json({ error: '見つかりません。' }, 404);
      const url = new URL(request.url), ownerScope = owner ? await ownerScopeFor(owner) : null;
      if (request.method === 'GET') {
        const id = url.searchParams.get('id'), pin = url.searchParams.get('pin');
        // 詳細の「保存」の印: その Agent を、本人のどのボードに保存しているか。
        if (pin !== null) {
          if (!owner) return json({ error: 'サインインしてください。' }, 401);
          const [found] = await store.pins([familyIdOf(pin)], owner);
          return json({ savedIn: found?.savedIn ?? [], ownerScope });
        }
        // 公開のボードは、未サインインでも読める。
        if (id !== null) return json({ ...await store.board(boardIdOf(id), owner, url.searchParams.get('cursor')), ownerScope });
        if (!owner) return json({ error: 'サインインしてください。' }, 401);
        return json({ ...await store.boards(owner), ownerScope });
      }
      if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      if (!owner) return json({ error: 'サインインしてください。' }, 401);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 4_096)));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NoahAgentError('入力形式を確認してください。');
      const value = input as Record<string, unknown>;
      const done = (result: object) => json({ ...result, ownerScope });
      switch (value.action) {
        case 'create': {
          exactly(value, ['action', 'name', 'visibility']);
          const name = noahBoardName(value.name), visibility = noahBoardVisibility(value.visibility);
          if (!name) throw new NoahAgentError('ボードの名前は、1〜40 文字で入れてください。');
          if (!visibility) throw new NoahAgentError('公開か非公開かを選んでください。');
          return done(await store.create(owner, name, visibility));
        }
        case 'update': {
          exactly(value, ['action', 'id', 'revision', ...Object.keys(value).filter((key) => key === 'name' || key === 'visibility')]);
          if (!('name' in value) && !('visibility' in value)) throw new NoahAgentError('変える項目を入れてください。');
          const name = 'name' in value ? noahBoardName(value.name) : undefined, visibility = 'visibility' in value ? noahBoardVisibility(value.visibility) : undefined;
          if (name === null) throw new NoahAgentError('ボードの名前は、1〜40 文字で入れてください。');
          if (visibility === null) throw new NoahAgentError('公開か非公開かを選んでください。');
          return done(await store.update(owner, boardIdOf(value.id), revisionOf(value.revision), { ...(name ? { name } : {}), ...(visibility ? { visibility } : {}) }));
        }
        case 'remove': exactly(value, ['action', 'id', 'revision']); return done(await store.remove(owner, boardIdOf(value.id), revisionOf(value.revision)));
        case 'save': exactly(value, ['action', 'boardId', 'familyId']); return done(await store.save(owner, boardIdOf(value.boardId), familyIdOf(value.familyId)));
        case 'unsave': exactly(value, ['action', 'boardId', 'familyId']); return done(await store.unsave(owner, boardIdOf(value.boardId), familyIdOf(value.familyId)));
        case 'follow': case 'unfollow': exactly(value, ['action', 'id']); return done(await store.follow(owner, boardIdOf(value.id), value.action === 'follow'));
        case 'hide': case 'unhide': exactly(value, ['action', 'familyId']); return done(await store.hide(owner, familyIdOf(value.familyId), value.action === 'hide'));
        default: throw new NoahAgentError('操作を確認してください。');
      }
    } catch (error) { return failure(error); }
  };
}
