/**
 * 試行の入口（task 114）。GET /api/noah/trial と POST /api/noah/trial。仕様: docs/noah/trial-300.md の 4・9 章。
 *
 * 切り替え NOAH_TRIAL_OPEN が閉の間は、札を読まず（入口を作らない）、報告の欄も出さない（本人向けは 404）。運営の画面と、札の登録は、閉じていても審査者が使える（出す前の準備）。
 * GET ?state=1（審査者）: 段・4 つの数・足りない条件・経路ごと・カードごとの合計・札の一覧。
 * GET ?me=1: サインインしているか（ownerScope）と、もう試行に入っているか。
 * GET ?card=<カードの ID>: 5 人以上の報告の合計（誰にでも）・本人の報告・入れられるか。
 * POST: { action: "enter", via } / { action: "report", packageId, listed, sold, netYen, minutes }（本人）、{ action: "channel", via, label, wave } / { action: "close", via }（審査者）。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import type { NoahShelfFlags } from './noah-shelf.ts';
import { createNoahTrialStore, type TrialDependencies } from './noah-trial.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';

export type TrialApiDependencies = TrialDependencies & { authenticate: (request: Request) => Promise<string>; reviewers: string[]; shelfFlags: NoahShelfFlags };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
const missing = () => json({ error: '見つかりません。' }, 404);
const PACKAGE_ID = /^pkg:[a-z0-9][a-z0-9-]{1,62}$/u;
function failure(error: unknown) {
  if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
  if (error instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインしてください。' }, 401);
  return json({ error: '試行を確認できません。少し待ってから再試行してください。' }, 503);
}
const exactly = (value: Record<string, unknown>, keys: string[]) => {
  const got = Object.keys(value);
  if (got.length !== keys.length || !got.every((key) => keys.includes(key))) throw new NoahAgentError('操作の項目を確認してください。');
};

export function createNoahTrialApi(deps: TrialApiDependencies) {
  const store = createNoahTrialStore(deps);
  return async (request: Request) => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      try { owner = await deps.authenticate(request); } catch (error) { if (request.method !== 'GET' || !(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error; }
      const reviewer = !!owner && deps.reviewers.includes(owner), open = deps.shelfFlags.trial, url = new URL(request.url);
      const ownerScope = owner ? await ownerScopeFor(owner) : null;
      if (request.method === 'GET') {
        if (url.searchParams.get('state') === '1') return reviewer ? json({ ...await store.state(), open, ownerScope }) : missing();
        if (!open) return missing();
        if (url.searchParams.get('me') === '1') return json({ ownerScope, entered: owner ? await store.entered(owner) : false });
        const card = url.searchParams.get('card');
        if (card !== null) {
          if (!PACKAGE_ID.test(card)) return missing();
          return json({ ...await store.card(owner, card), ownerScope });
        }
        return missing();
      }
      if (!owner || request.headers.get('origin') !== url.origin) return json({ error: '同じNoahから操作してください。' }, 403);
      if (request.headers.get(OWNER_SCOPE_HEADER) !== ownerScope) return json({ error: 'アカウントが変わりました。再読込してください。' }, 409);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return json({ error: 'JSONで操作してください。' }, 415);
      const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedNoahBody(request, 4096)));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new NoahAgentError('入力形式を確認してください。');
      const value = input as Record<string, unknown>;
      if (value.action === 'channel' || value.action === 'close') {
        if (!reviewer) return json({ error: '同じNoahから操作してください。' }, 403);
        if (value.action === 'channel') { exactly(value, ['action', 'via', 'label', 'wave']); return json({ ...await store.addChannel(value.via, value.label, value.wave), ownerScope }); }
        exactly(value, ['action', 'via']);
        return json({ ...await store.closeChannel(value.via), ownerScope });
      }
      if (!open) return missing();
      if (value.action === 'enter') { exactly(value, ['action', 'via']); return json({ ...await store.enter(owner, value.via), ownerScope }); }
      if (value.action === 'report') {
        exactly(value, ['action', 'packageId', 'listed', 'sold', 'netYen', 'minutes']);
        if (typeof value.packageId !== 'string' || !PACKAGE_ID.test(value.packageId)) throw new NoahAgentError('カードの ID を確認してください。');
        return json({ ...await store.report(owner, value.packageId, value), ownerScope });
      }
      throw new NoahAgentError('操作を確認してください。');
    } catch (error) { return failure(error); }
  };
}
