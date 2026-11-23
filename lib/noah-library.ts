import { isNoahCover } from './noah-cover.ts';
import { noahAgentStore } from './noah-agent-store.ts';
import { skyAgentLibraryStore } from './sky-agent-library-store.ts';
import { ownerScopeFor } from './owner-intent.ts';

/** References existing author uploads and role settings; never duplicates execution or entitlement records. */
export function createNoahLibraryApi(deps: { db: Pick<D1Database, 'prepare'>; authenticate: (r: Request) => Promise<string>; mode?: 'test'|'live' }) {
  return async (request: Request) => {
    const headers = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
    try {
      const owner = await deps.authenticate(request);
      const [uploads, roles] = await Promise.all([noahAgentStore(deps.db, owner).list(), skyAgentLibraryStore(deps.db, owner).list()]);
      const releases = await deps.db.prepare(`SELECT DISTINCT p.package_key AS packageKey,p.manifest_sha256 AS manifestSha256,
        CASE WHEN json_valid(p.manifest) THEN json_extract(p.manifest,'$.name') END AS name,p.version,json_extract(p.manifest,'$.cover') AS coverJson
        FROM sky_tool_packages p WHERE json_valid(p.manifest) AND json_type(p.manifest,'$.source.artifact.runtime')='object'
        AND (p.user_id=? OR EXISTS(SELECT 1 FROM sky_commerce_orders o WHERE o.buyer_user_id=? AND o.mode=? AND o.status='paid'
          AND o.package_key=p.package_key AND o.manifest_sha256=p.manifest_sha256)) ORDER BY p.created_at DESC LIMIT 200`)
        .bind(owner,owner,deps.mode??'unconfigured').all<{packageKey: string; manifestSha256: string; name: string; version: string; coverJson: string | null}>();
      const editions = releases.results.map(({coverJson, ...edition}) => {
        const cover: unknown = coverJson && JSON.parse(coverJson);
        return isNoahCover(cover) ? {...edition,cover} : edition;
      });
      return Response.json({ ownerScope: await ownerScopeFor(owner), uploads, roles, releases: editions }, { headers });
    } catch (e) {
      const signedOut = e instanceof Error && e.message === 'UNAUTHORIZED';
      return Response.json({ error: signedOut ? 'サインインすると自分のAgentを表示できます。' : '自分のAgentを読み込めません。再試行してください。' }, { status: signedOut ? 401 : 503, headers });
    }
  };
}
