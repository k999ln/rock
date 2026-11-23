import type { NoahCover } from './noah-cover.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from './owner-intent.ts';
import type { SkyToolPackage } from './sky-tool-package.ts';
import { isNoahAgentPackage } from './noah-agent-package-view.ts';
import { noahRecommendationContext, noahRecommendationSettings } from './noah-recommendations.ts';

export type NoahFeedPreference = { kind: 'follow' | 'hide' | 'interest' | 'personalize'; subject: string };
export type NoahFeedEntry = { cover?: NoahCover; isAgent: boolean; packageKey: string; toolId: string; version: string; digest: string; name: string; summary: string; authorId: string; author: string; categories: string[]; priceNote: string; publishedAt: number; reason: string };
export type NoahFeedPage = { entries: NoahFeedEntry[]; nextCursor: string | null; preferences: NoahFeedPreference[]; ownerScope: string | null; snapshot: number };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
type FeedRow = { package_key: string; tool_id: string; manifest_sha256: string; manifest: string; published_at: number; score: number; followed: number; interest: number; history: number; compatible: number };
export function createNoahFeedApi(deps: { db: Pick<D1Database, 'prepare'>; authenticate: (r: Request) => Promise<string>; clock?: () => number; publicTags?: (id:string)=>string[] }) {
  const now = deps.clock || Date.now;
  const preferences = async (owner: string | null) => owner ? (await deps.db.prepare('SELECT kind,subject FROM noah_feed_preferences WHERE owner_id=? ORDER BY kind,subject LIMIT 256').bind(owner).all<NoahFeedPreference>()).results : [];
  async function handle(request: Request, mutate: boolean, work: (owner: string | null) => Promise<Response>) {
    try {
      let owner: string | null;
      try { owner = await deps.authenticate(request); } catch (e) { if (!mutate && e instanceof Error && e.message === 'UNAUTHORIZED') owner = null; else throw e; }
      if (mutate && request.headers.get('origin') !== new URL(request.url).origin) throw new NoahAgentError('同じNoahから操作してください。', 403);
      if (mutate && request.headers.get(OWNER_SCOPE_HEADER) !== await ownerScopeFor(owner!)) throw new NoahAgentError('アカウントが変わりました。再読込してください。', 409);
      return await work(owner);
    } catch (e) {
      if (e instanceof NoahAgentError) return json({ error: e.message }, e.status);
      if (e instanceof Error && e.message === 'UNAUTHORIZED') return json({ error: 'サインインするとフォローや興味を保存できます。' }, 401);
      if (e instanceof SyntaxError) return json({ error: '入力形式を確認してください。' }, 400);
      return json({ error: '公開Agentを読み込めません。再試行してください。' }, 503);
    }
  }
  return {
    get: (request: Request) => handle(request, false, async owner => {
      const params = new URL(request.url).searchParams, order = params.get('order') || 'recommended', query = (params.get('q') || '').trim().toLowerCase();
      if (!['recommended', 'latest', 'following'].includes(order) || query.length > 200) throw new NoahAgentError('検索条件を確認してください。');
      const pref = await preferences(owner), enabled = pref.some(p => p.kind === 'personalize');
      const following = pref.filter(p => p.kind === 'follow').map(p => p.subject), hidden = pref.filter(p => p.kind === 'hide').map(p => p.subject), interests = pref.filter(p => p.kind === 'interest').map(p => p.subject);
      const settings = await noahRecommendationSettings(deps.db,owner);
      const fingerprint = await noahSha256(new TextEncoder().encode(JSON.stringify([owner, order, query, pref, settings])));
      let snapshot = now(), after: [number, number, string] | null = null;
      const raw = params.get('cursor');
      if (raw) {
        try {
          if (raw.length > 1024) throw new Error();
          const c: unknown = JSON.parse(atob(raw));
          if (!Array.isArray(c) || c.length !== 5 || c[4] !== fingerprint || !Number.isSafeInteger(c[0]) || c[0] > now() + 30000 || c[0] < now() - 900000 || !Number.isInteger(c[1]) || c[1]<0 || c[1]>75 || c[1]%5!==0 || !Number.isSafeInteger(c[2]) || c[2] > c[0] || typeof c[3] !== 'string' || c[3].length > 240) throw new Error();
          snapshot = c[0] as number; after = [c[1] as number, c[2] as number, c[3]];
        } catch { throw new NoahAgentError('新着または設定が変わりました。先頭から読み直してください。'); }
      }
      const ranked = enabled && order === 'recommended';
      const context=await noahRecommendationContext(deps.db,owner,snapshot,settings,pref,deps.publicTags);
      const args: Array<string | number> = [JSON.stringify(following), JSON.stringify(interests), JSON.stringify(context.historyTags),settings.runtime,settings.runtime,now(), snapshot, JSON.stringify(hidden), query, query];
      let where = order === 'following' ? 'followed=1' : '1=1';
      if (after) { where += ' AND (score < ? OR (score = ? AND (published_at < ? OR (published_at = ? AND package_key < ?))))'; args.push(after[0], after[0], after[1], after[1], after[2]); }
      const rows = await deps.db.prepare(`WITH candidates AS (
        SELECT p.package_key,p.tool_id,p.manifest_sha256,p.manifest,p.published_at,
          EXISTS(SELECT 1 FROM json_each(?) f WHERE f.value=json_extract(p.manifest,'$.developer.id')) AS followed,
          EXISTS(SELECT 1 FROM json_each(?) i WHERE EXISTS(SELECT 1 FROM json_each(p.manifest,'$.fund.categories') c WHERE lower(c.value)=i.value)
            OR EXISTS(SELECT 1 FROM json_each(p.manifest,'$.fund.tags') t WHERE lower(t.value)=i.value)) AS interest,
          EXISTS(SELECT 1 FROM json_each(?) h WHERE EXISTS(SELECT 1 FROM json_each(p.manifest,'$.fund.tags') t WHERE lower(t.value)=h.value)) AS history,
          (json_type(p.manifest,'$.source.artifact.runtime')='object' AND (?='headless' OR (?='local-model' AND json_extract(p.manifest,'$.source.artifact.runtime.model') IN ('qwen2.5:1.5b','qwen3:4b')))) AS compatible
        FROM sky_tool_packages p WHERE p.status='verified' AND p.published_at IS NOT NULL
          AND EXISTS(SELECT 1 FROM sky_tool_package_reviews r WHERE r.package_key=p.package_key AND r.manifest_sha256=p.manifest_sha256 AND r.decision='verified' AND (r.expires_at IS NULL OR r.expires_at>?))
          AND p.published_at <= ? AND NOT EXISTS(SELECT 1 FROM json_each(?) h WHERE h.value=p.tool_id)
          AND (?='' OR instr(lower(p.manifest),?)>0)
      ), ranked AS (SELECT *,${ranked ? '(followed*40 + interest*20 + history*10 + COALESCE(compatible,0)*5)' : '0'} AS score FROM candidates)
      SELECT * FROM ranked WHERE ${where} ORDER BY score DESC,published_at DESC,package_key DESC LIMIT 21`).bind(...args).all<FeedRow>();
      const page = rows.results.slice(0, 20), last = page.at(-1);
      const entries: NoahFeedEntry[] = page.map(row => {
        const m = JSON.parse(row.manifest) as SkyToolPackage;
        return { ...(m.cover ? { cover: m.cover } : {}), isAgent: isNoahAgentPackage(m), packageKey: row.package_key, toolId: row.tool_id, version: m.version, digest: row.manifest_sha256, name: m.name, summary: m.summary,
          authorId: m.developer.id, author: m.developer.displayName, categories: m.fund.categories, priceNote: m.pricing.note, publishedAt: row.published_at,
          reason: row.followed && (ranked || order === 'following') ? 'フォロー中の提供元' : ranked && row.interest ? '選んだ興味に関連' : ranked && row.history ? '同意後に利用したAgentの公開タグに関連' : ranked && row.compatible ? '選んだMacの実行方法に対応（接続状態は詳細で確認）' : '公開・更新されたAgentとTool' };
      });
      return json({ entries, preferences: pref, ownerScope: owner ? await ownerScopeFor(owner) : null, snapshot,
        nextCursor: rows.results.length > 20 && last ? btoa(JSON.stringify([snapshot, last.score, last.published_at, last.package_key, fingerprint])) : null } satisfies NoahFeedPage);
    }),
    set: (request: Request) => handle(request, true, async owner => {
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw new NoahAgentError('JSONで操作してください。', 415);
      const value = JSON.parse(new TextDecoder().decode(await boundedNoahBody(request, 2048))) as Record<string, unknown>;
      if (!value || Array.isArray(value) || Object.keys(value).some(k => !['kind', 'subject', 'active'].includes(k)) || !['follow','hide','interest','personalize'].includes(String(value.kind)) || typeof value.subject !== 'string' || typeof value.active !== 'boolean') throw new NoahAgentError('設定を確認してください。');
      const subject = value.kind === 'interest' ? value.subject.trim().normalize('NFKC').toLowerCase() : value.subject;
      if (!subject || subject.length > 160 || Array.from(subject).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || (value.kind === 'personalize' && subject !== 'enabled')) throw new NoahAgentError('設定する項目を確認してください。');
      if (value.active) {
        const result = await deps.db.prepare(`INSERT OR IGNORE INTO noah_feed_preferences(owner_id,kind,subject,created_at)
          SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM noah_feed_preferences WHERE owner_id=?)<256 RETURNING subject`).bind(owner, value.kind, subject, now(), owner).all();
        if (!result.results.length && !(await preferences(owner)).some(p => p.kind === value.kind && p.subject === subject)) throw new NoahAgentError('保存した設定は256件までです。不要な設定を解除してください。', 429);
      } else await deps.db.prepare('DELETE FROM noah_feed_preferences WHERE owner_id=? AND kind=? AND subject=? RETURNING subject').bind(owner, value.kind, subject).all();
      return json({ preferences: await preferences(owner), ownerScope: await ownerScopeFor(owner!) });
    }),
  };
}
