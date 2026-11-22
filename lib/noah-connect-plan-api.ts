/**
 * 接続計画の API: `GET /api/noah/connect-plan?agent=<系列の ID>`。その人が、その Agent へつなぐ時に、足りない物と手数を返す。
 * 未サインインでも読める（その時は「サインイン」が 1 タップ）。何も書かない。権限も利用権も与えない。
 * 接続（`POST /api/noah/connect`）は、ここで返した planSha256 を受け取り、同じ計算をやり直して照らす（lib/noah-connect.ts）。
 * ローンチの範囲: `agent` は、取り込んだ系列の ID だけ。今ある Agent の ID は 404。仕様: docs/noah/spec-96-connect-plan.md の 5.1・9.4。
 */
import { NoahAgentError } from './noah-agent-upload.ts';
import { NOAH_CONNECT_MESSAGES, type NoahConnectApiDependencies } from './noah-connect.ts';
import { planNoahSubject, readNoahSubject } from './noah-connect-source.ts';
import { noahAllowed } from './noah-flags.ts';
import { ownerScopeFor } from './owner-intent.ts';

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });

export function createNoahConnectPlanApi(deps: NoahConnectApiDependencies) {
  return async (request: Request) => {
    try {
      if (request.method !== 'GET') return json({ error: '対応しない操作です。' }, 405);
      let owner: string | null = null;
      try { owner = await deps.authenticate(request); } catch (error) { if (!(error instanceof Error && error.message === 'UNAUTHORIZED')) throw error; }
      // 見せてよいか。閉じている間、審査者でない人には、無い物として答える（一覧の API と同じ）。
      if (!noahAllowed(deps.flags, 'list', !!owner && deps.reviewers.includes(owner))) return json({ error: '見つかりません。' }, 404);
      const agent = new URL(request.url).searchParams.get('agent') ?? '';
      const subject = agent.length >= 3 && agent.length <= 400 ? await readNoahSubject(deps.db, agent) : null;
      if (!subject) return json({ error: NOAH_CONNECT_MESSAGES.missingAgent }, 404);
      const { target } = subject;
      // 載せていない系列（鍵の要る物・量産・取り下げた物・握手が通っていない物）は、つなげない。
      if (!subject.listing.listed || !target) return json({ error: NOAH_CONNECT_MESSAGES.unlisted }, 422);
      const { plan, view } = await planNoahSubject(deps, owner, { ...subject, target });
      if (plan.badge === 'blocked') return json({ error: plan.reason ?? NOAH_CONNECT_MESSAGES.unlisted }, 422);
      return json({ ...view, ownerScope: owner ? await ownerScopeFor(owner) : null });
    } catch (error) {
      if (error instanceof NoahAgentError) return json({ error: error.message }, error.status);
      return json({ error: '計画を確かめられません。少し待ってから再試行してください。' }, 503);
    }
  };
}
