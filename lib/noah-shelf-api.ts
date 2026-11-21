/**
 * 棚の入口（task 110）。GET /api/noah/shelf: 棚の一覧（サインイン不要）。運営の画面は ?state=1（審査者だけ）。
 * POST /api/noah/shelf: 審査者だけ。カードを置く（put）・動かして確かめた（verify）・外す（retire）・専門家の確かめ（review）。
 * 本人の操作（task 111）: 「非表示」（hide。サインインした本人）と、詳細を開いた記録（opened。未サインインも。切り替え NOAH_SHELF_SEEN が開いている時だけ数える）。
 * 並びに実績を使うのは、切り替え NOAH_SHELF_RANK が開いている時だけ。見せた記録は、応答の後に書く（waitUntil）。
 *
 * 見せてよいかは、切り替え NOAH_SHELF_PUBLIC と、取り込んだ一覧の切り替え（カードの行き先が、その詳細の画面なので）の両方。閉じていても、審査者は使える。
 * 書き込みの検査は、ほかの Noah の入口と同じ（同じ Origin・account の印・JSON・本文の大きさ）。
 * 仕様: docs/noah/spec-110-shelf.md の 10 章・13 章。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { noahAllowed, type NoahFlags } from './noah-flags.ts';
import { NOAH_PACKAGE_LIMITS, noahShelfOptions, type NoahShelfFlags } from './noah-shelf.ts';
import { createNoahShelfStore, type ShelfDependencies } from './noah-shelf-store.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';

export type ShelfApiDependencies = ShelfDependencies & {
  authenticate: (request: Request) => Promise<string>; reviewers: string[]; flags: NoahFlags; shelfFlags: NoahShelfFlags;
  /** 応答の後に続ける仕事（見せた記録）。無ければ、応答の前に書く。 */
  waitUntil?: (work: Promise<unknown>) => void;
};
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
  return json({ error: '棚を確認できません。少し待ってから再試行してください。' }, 503);
}
const revisionOf = (value: unknown, nullable: boolean): number | null => {
  if (nullable && value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) throw new NoahAgentError('版を確認してください。');
  return value;
};
const idOf = (value: unknown) => {
  if (typeof value !== 'string' || !/^pkg:[a-z0-9][a-z0-9-]{1,62}$/u.test(value)) throw new NoahAgentError('カードの ID を確認してください。');
  return value;
};
const exactly = (value: Record<string, unknown>, keys: string[]) => {
  const got = Object.keys(value);
  if (got.length !== keys.length || !got.every((key) => keys.includes(key))) throw new NoahAgentError('操作の項目を確認してください。');
};

export function createNoahShelfApi(deps: ShelfApiDependencies) {
  const store = createNoahShelfStore(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      // 未サインインでも、棚を読む・開いた事を数えるのは受け付ける。それ以外の操作は、下でサインインを求める。
      try { owner = await deps.authenticate(request); } catch (error) { if (!(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error; }
      const reviewer = !!owner && deps.reviewers.includes(owner), url = new URL(request.url);
      const options = noahShelfOptions(deps.shelfFlags, { reviewer, deviceOnline: false, recommendations: false });
      // カードを押した先（取り込んだ Agent の詳細）が見られない人には、棚も出さない。
      if (!options.visible || !noahAllowed(deps.flags, 'list', reviewer)) return json({ error: '見つかりません。' }, 404);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      const later = async (work: Promise<unknown>) => { const quiet = work.catch(() => undefined); if (deps.waitUntil) deps.waitUntil(quiet); else await quiet; };
      if (request.method === 'GET') {
        if (url.searchParams.get('state') === '1') return reviewer ? json({ ...await store.state(), warnings: deps.shelfFlags.warnings, ownerScope }) : json({ error: '見つかりません。' }, 404);
        const listed = await store.list({ owner, byEvidence: options.byEvidence, seen: deps.shelfFlags.seen });
        if (deps.shelfFlags.seen) await later(store.record(owner, listed.shelves.flatMap((shelf) => shelf.cards.map((card) => ({ id: card.id, position: card.position }))), 'shown'));
        return json({ ...listed, ownerScope });
      }
      if (request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 16_384)));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NoahAgentError('入力形式を確認してください。');
      const value = input as Record<string, unknown>;
      // 詳細を開いた記録は、数だけ（account の印は見ない。未サインインの人も数える）。
      if (value.action === 'opened') {
        exactly(value, ['action', 'id', 'pos']);
        const pos = value.pos;
        if (typeof pos !== 'number' || !Number.isSafeInteger(pos) || pos < 1 || pos > NOAH_PACKAGE_LIMITS.cardsPerShelf) throw new NoahAgentError('位置を確認してください。');
        if (deps.shelfFlags.seen) await later(store.record(owner, [{ id: idOf(value.id), position: pos }], 'opened'));
        return json({ recorded: deps.shelfFlags.seen });
      }
      if (!owner) return json({ error: 'サインインしてください。' }, 401);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      if (value.action === 'hide') {
        exactly(value, ['action', 'id', 'hidden']);
        if (typeof value.hidden !== 'boolean') throw new NoahAgentError('表示するかを確認してください。');
        return json({ ...await store.hide(owner, idOf(value.id), value.hidden), ownerScope });
      }
      if (!reviewer) return json({ error: '同じNoahから操作してください。' }, 403);
      if (value.action === 'put') { exactly(value, ['action', 'package', 'revision']); return json({ ...await store.put(value.package, revisionOf(value.revision, true)), ownerScope }); }
      if (value.action === 'verify') { exactly(value, ['action', 'id', 'revision']); return json({ ...await store.verify(owner!, idOf(value.id), revisionOf(value.revision, false)!), ownerScope }); }
      if (value.action === 'retire') { exactly(value, ['action', 'id', 'revision']); return json({ ...await store.retire(idOf(value.id), revisionOf(value.revision, false)!), ownerScope }); }
      if (value.action === 'review') {
        exactly(value, ['action', 'id', 'revision', 'expertAt']);
        if (typeof value.expertAt !== 'number') throw new NoahAgentError('確かめた日を確認してください。');
        return json({ ...await store.review(idOf(value.id), revisionOf(value.revision, false)!, value.expertAt), ownerScope });
      }
      throw new NoahAgentError('操作を確認してください。');
    } catch (error) { return failure(error); }
  };
}
