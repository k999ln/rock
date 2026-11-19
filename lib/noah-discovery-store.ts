import { NoahAgentError } from './noah-agent-upload.ts';
import {
  collectDiscoverySource,
  discoveryDigest,
  discoveryIdentity,
  discoverySources,
  DiscoveryFailure,
  type DiscoveryProvider,
  type DiscoveryMetadata,
  type DiscoveryKnown,
} from './noah-discovery-provider.ts';
import {
  readDiscoveryCursor,
  signDiscoveryCursor,
} from './noah-discovery-cursor.ts';
import type { NoahFeedPreference } from './noah-feed.ts';
import { noahRecommendationContext, noahRecommendationSettings } from './noah-recommendations.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Source = {
  id: DiscoveryProvider;
  lease_id: string | null;
  lease_until: number;
  next_run_at: number;
  last_attempt_at: number | null;
  last_success_at: number | null;
  etag: string | null;
  cursor_key: string | null;
  error_code: string | null;
  failure_count: number;
  observed: number;
  withdrawn: number;
  request_count: number;
};
type Candidate = {
  id: string;
  provider: DiscoveryProvider;
  external_id: string;
  repository: string;
  digest: string;
  state: 'active' | 'withdrawn';
  revision: number;
  first_seen_at: number;
  changed_at: number;
  checked_at: number;
};
export type DiscoveryEntry = {
  id: string;
  revision: number;
  digest: string;
  metadata: DiscoveryMetadata;
  observedAt: number;
  checkedAt: number;
  reason: string;
};
export const DISCOVERY_INTERVAL = 7200000,
  DISCOVERY_LEASE = 300000,
  DISCOVERY_FRESH = 86400000;
export function createDiscoveryStore({
  db,
  now = Date.now,
  fetcher = fetch,
  publicTags,
}: {
  db: Database;
  now?: () => number;
  fetcher?: typeof fetch;
  publicTags?: (id:string)=>string[];
}) {
  const ensureSources = () => db.batch(discoverySources.map(({ id }) => db.prepare('INSERT OR IGNORE INTO noah_discovery_sources(id) VALUES(?)').bind(id)));
  const sourceRow = (id: DiscoveryProvider) =>
    db
      .prepare('SELECT * FROM noah_discovery_sources WHERE id=?')
      .bind(id)
      .first<Source>();
  const guard = (id: DiscoveryProvider, lease: string) => ({
    sql: 'EXISTS(SELECT 1 FROM noah_discovery_sources WHERE id=? AND lease_id=? AND lease_until>? AND last_attempt_at<=?)',
    args: [id, lease, now(), now()],
  });
  async function cursorKey() {
    await ensureSources();
    let row = await sourceRow('github');
    if (!row) throw Error('discovery migration required');
    if (!row.cursor_key) {
      const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
        v.toString(16).padStart(2, '0'),
      ).join('');
      await db
        .prepare(
          "UPDATE noah_discovery_sources SET cursor_key=? WHERE id='github' AND cursor_key IS NULL",
        )
        .bind(key)
        .run();
      row = await sourceRow('github');
    }
    if (!row?.cursor_key) throw Error('cursor unavailable');
    return row.cursor_key;
  }
  async function storeMetadata(
    source: DiscoveryProvider,
    lease: string,
    metadata: DiscoveryMetadata,
  ) {
    const id = await discoveryIdentity(source, metadata.externalId),
      digest = await discoveryDigest(metadata),
      stamp = now(),
      g = guard(source, lease),
      body = JSON.stringify(metadata);
    const result = await db.batch([
      db
        .prepare(`INSERT INTO noah_discovery_candidates(id,provider,external_id,repository,digest,state,revision,first_seen_at,changed_at,checked_at)
        SELECT ?,?,?,?,?,'active',1,?,?,? WHERE ${g.sql} AND ((SELECT COUNT(*) FROM noah_discovery_candidates)<10000 OR EXISTS(SELECT 1 FROM noah_discovery_candidates WHERE id=?))
        ON CONFLICT(id) DO UPDATE SET repository=excluded.repository,digest=excluded.digest,state='active',
        revision=noah_discovery_candidates.revision+CASE WHEN noah_discovery_candidates.digest!=excluded.digest OR noah_discovery_candidates.state!='active' THEN 1 ELSE 0 END,
        changed_at=CASE WHEN noah_discovery_candidates.digest!=excluded.digest OR noah_discovery_candidates.state!='active' THEN excluded.changed_at ELSE noah_discovery_candidates.changed_at END,
        checked_at=MAX(noah_discovery_candidates.checked_at,excluded.checked_at)`)
        .bind(
          id,
          source,
          metadata.externalId,
          metadata.repository,
          digest,
          stamp,
          stamp,
          stamp,
          ...g.args,
          id,
        ),
      db
        .prepare(`INSERT INTO noah_discovery_versions(candidate_id,revision,digest,metadata_json,state,observed_at)
        SELECT id,revision,digest,?,state,changed_at FROM noah_discovery_candidates WHERE id=? AND digest=? AND ${g.sql} ON CONFLICT(candidate_id,revision) DO NOTHING`)
        .bind(body, id, digest, ...g.args),
    ]);
    if (result[0].meta.changes !== 1) {
      if (
        !(await db
          .prepare(`SELECT 1 WHERE ${g.sql}`)
          .bind(...g.args)
          .first())
      )
        throw new DiscoveryFailure('lease_lost');
      throw new DiscoveryFailure('capacity');
    }
  }
  async function withdraw(
    source: DiscoveryProvider,
    lease: string,
    id: string,
  ) {
    const g = guard(source, lease),
      stamp = now();
    await db.batch([
      db
        .prepare(
          `UPDATE noah_discovery_candidates SET state='withdrawn',revision=revision+1,changed_at=?,checked_at=? WHERE id=? AND provider=? AND state='active' AND ${g.sql}`,
        )
        .bind(stamp, stamp, id, source, ...g.args),
      db
        .prepare(`INSERT INTO noah_discovery_versions(candidate_id,revision,digest,metadata_json,state,observed_at)
        SELECT c.id,c.revision,c.digest,v.metadata_json,c.state,c.changed_at FROM noah_discovery_candidates c JOIN noah_discovery_versions v ON v.candidate_id=c.id AND v.revision=c.revision-1
        WHERE c.id=? AND c.state='withdrawn' AND ${g.sql} ON CONFLICT(candidate_id,revision) DO NOTHING`)
        .bind(id, ...g.args),
    ]);
  }
  async function sync() {
    await ensureSources();
    const outcomes: Record<string, string> = {};
    for (const { id } of discoverySources) {
      const lease = crypto.randomUUID(),
        stamp = now();
      const claim = await db
        .prepare(
          'UPDATE noah_discovery_sources SET lease_id=?,lease_until=?,last_attempt_at=? WHERE id=? AND next_run_at<=? AND lease_until<=?',
        )
        .bind(lease, stamp + DISCOVERY_LEASE, stamp, id, stamp, stamp)
        .run();
      if (claim.meta.changes !== 1) {
        outcomes[id] = 'not_due';
        continue;
      }
      const source = await sourceRow(id);
      if (!source || source.lease_id !== lease) continue;
      try {
        const known = (
          await db
            .prepare(
              "SELECT id,external_id,repository FROM noah_discovery_candidates WHERE provider=? AND state='active' ORDER BY checked_at,id LIMIT 3",
            )
            .bind(id)
            .all<DiscoveryKnown>()
        ).results;
        const result = await collectDiscoverySource({
          provider: id,
          etag: source.etag,
          known,
          fetcher,
          now,
          onCandidate: (m) => storeMetadata(id, lease, m),
          onWithdrawn: (target) => withdraw(id, lease, target),
        });
        const g = guard(id, lease);
        const saved = await db
          .prepare(
            `UPDATE noah_discovery_sources SET lease_id=NULL,lease_until=0,next_run_at=?,last_success_at=?,etag=?,error_code=NULL,failure_count=0,observed=?,withdrawn=?,request_count=? WHERE id=? AND ${g.sql}`,
          )
          .bind(
            now() + DISCOVERY_INTERVAL,
            now(),
            result.etag,
            result.observed,
            result.withdrawn,
            result.calls,
            id,
            ...g.args,
          )
          .run();
        outcomes[id] = saved.meta.changes === 1 ? 'updated' : 'lease_lost';
      } catch (e) {
        const failure =
            e instanceof DiscoveryFailure
              ? e
              : new DiscoveryFailure('unavailable'),
          next = Math.max(
            failure.retryAt ?? 0,
            now() +
              Math.min(
                86400000,
                DISCOVERY_INTERVAL * 2 ** Math.min(source.failure_count, 4),
              ),
          );
        await db
          .prepare(
            'UPDATE noah_discovery_sources SET lease_id=NULL,lease_until=0,next_run_at=?,error_code=?,failure_count=failure_count+1 WHERE id=? AND lease_id=?',
          )
          .bind(next, failure.code, id, lease)
          .run();
        outcomes[id] = failure.code;
      }
    }
    // Preserve every version a live 15-minute cursor might still reference.
    await db
      .prepare(
        'DELETE FROM noah_discovery_versions WHERE observed_at<? AND EXISTS(SELECT 1 FROM noah_discovery_versions successor WHERE successor.candidate_id=noah_discovery_versions.candidate_id AND successor.revision>noah_discovery_versions.revision AND successor.observed_at<=?) AND revision<(SELECT MAX(v.revision)-19 FROM noah_discovery_versions v WHERE v.candidate_id=noah_discovery_versions.candidate_id)',
      )
      .bind(now() - 900000, now() - 900000)
      .run();
    return outcomes;
  }
  async function preferences(owner: string | null) {
    return owner
      ? (
          await db
            .prepare(
              'SELECT kind,subject FROM noah_feed_preferences WHERE owner_id=? ORDER BY kind,subject LIMIT 256',
            )
            .bind(owner)
            .all<NoahFeedPreference>()
        ).results
      : [];
  }
  async function status() {
    await ensureSources();
    const rows = await db
      .prepare(
        'SELECT id,lease_until,next_run_at,last_attempt_at,last_success_at,error_code,observed,withdrawn,request_count FROM noah_discovery_sources ORDER BY id',
      )
      .all<
        Omit<Source, 'cursor_key' | 'etag' | 'lease_id' | 'failure_count'>
      >();
    return rows.results.map((row) => ({
      ...row,
      label: discoverySources.find((s) => s.id === row.id)!.label,
    }));
  }
  async function list(owner: string | null, params: URLSearchParams) {
    const query = (params.get('q') ?? '')
        .trim()
        .normalize('NFKC')
        .toLowerCase(),
      order = params.get('order') ?? 'recommended';
    if (
      query.length > 200 ||
      !['recommended', 'latest', 'following'].includes(order)
    )
      throw new NoahAgentError('検索条件を確認してください。');
    const pref = await preferences(owner),
      ranked =
        order === 'recommended' && pref.some((p) => p.kind === 'personalize'),
      follow = pref.filter((p) => p.kind === 'follow').map((p) => p.subject),
      hide = pref.filter((p) => p.kind === 'hide').map((p) => p.subject),
      interests = pref
        .filter((p) => p.kind === 'interest')
        .map((p) => p.subject);
    const recommendationSettings = await noahRecommendationSettings(db,owner);
    const fingerprint = await discoveryDigest([owner, query, order, pref,recommendationSettings]),
      secret = await cursorKey(),
      cursor = params.get('cursor'),
      saved = cursor
        ? await readDiscoveryCursor(cursor, secret, fingerprint, now())
        : null,
      asOf = saved?.asOf ?? now();
    const watermark =
      saved?.watermark ??
      Number(
        (
          await db
            .prepare(
              'SELECT COALESCE(MAX(rowid),0) AS mark FROM noah_discovery_versions',
            )
            .first<{ mark: number }>()
        )?.mark ?? 0,
      );
    const context=await noahRecommendationContext(db,owner,asOf,recommendationSettings,pref,publicTags);
    const args: unknown[] = [
      asOf,
      watermark,
      now() - DISCOVERY_FRESH,
      JSON.stringify(hide),
      query,
      query,
      JSON.stringify(follow),
      JSON.stringify(interests),
      JSON.stringify(context.historyTags),
    ];
    let where = order === 'following' ? 'followed=1' : '1=1';
    if (saved) {
      where +=
        ' AND (score<? OR (score=? AND (observed_at<? OR (observed_at=? AND id<?))))';
      args.push(
        saved.after[0],
        saved.after[0],
        saved.after[1],
        saved.after[1],
        saved.after[2],
      );
    }
    const result = await db
      .prepare(`WITH observed AS (
      SELECT c.id,c.checked_at,v.revision,v.digest,v.metadata_json,v.observed_at FROM noah_discovery_candidates c JOIN noah_discovery_versions v ON v.candidate_id=c.id
      WHERE v.revision=(SELECT MAX(p.revision) FROM noah_discovery_versions p WHERE p.candidate_id=c.id AND p.observed_at<=? AND p.rowid<=?)
      AND c.state='active' AND v.state='active' AND c.checked_at>=? AND NOT EXISTS(SELECT 1 FROM json_each(?) h WHERE h.value=c.id)
      AND (?='' OR instr(lower(v.metadata_json),?)>0)
    ), features AS (SELECT *,EXISTS(SELECT 1 FROM json_each(?) f WHERE f.value=json_extract(metadata_json,'$.authorId')) AS followed,
      EXISTS(SELECT 1 FROM json_each(?) i JOIN json_each(metadata_json,'$.tags') t ON i.value=t.value) AS interest,
      EXISTS(SELECT 1 FROM json_each(?) h JOIN json_each(metadata_json,'$.tags') t ON h.value=t.value) AS history FROM observed),
    ranked AS (SELECT *,${ranked ? 'interest*40+followed*15+history*5' : '0'} AS score FROM features)
    SELECT * FROM ranked WHERE ${where} ORDER BY score DESC,observed_at DESC,id DESC LIMIT 21`)
      .bind(...args)
      .all<{
        id: string;
        checked_at: number;
        revision: number;
        digest: string;
        metadata_json: string;
        observed_at: number;
        followed: number;
        interest: number;
        history: number;
        score: number;
      }>();
    const rows = result.results.slice(0, 20),
      last = rows.at(-1);
    const entries: DiscoveryEntry[] = rows.map((r) => ({
      id: r.id,
      revision: r.revision,
      digest: r.digest,
      metadata: JSON.parse(r.metadata_json),
      observedAt: r.observed_at,
      checkedAt: r.checked_at,
      reason:
        ranked && r.interest
          ? '選んだ興味に関連'
          : r.followed && (ranked || order === 'following')
            ? 'フォロー中の提供元'
            : ranked && r.history ? '同意後に利用したAgentの公開タグに関連' : '公開ソースで新着・更新を確認',
    }));
    const retired = (
      await db
        .prepare(
          "SELECT id FROM noah_discovery_candidates WHERE state='withdrawn' AND changed_at>=? ORDER BY changed_at DESC LIMIT 201",
        )
        .bind(now() - DISCOVERY_FRESH)
        .all<{ id: string }>()
    ).results;
    return {
      entries,
      preferences: pref,
      snapshot: asOf,
      serverNow: now(),
      retired: retired.slice(0, 200).map((r) => r.id),
      retiredOverflow: retired.length > 200,
      sources: await status(),
      nextCursor:
        result.results.length > 20 && last
          ? await signDiscoveryCursor(
              {
                algorithm: 1,
                fingerprint,
                asOf,
                watermark,
                expiresAt: asOf + 900000,
                after: [last.score, last.observed_at, last.id],
              },
              secret,
            )
          : null,
    };
  }
  async function detail(id: string) {
    if (!/^discovery-[a-f0-9]{24}$/.test(id))
      throw new NoahAgentError('候補が見つかりません。', 404);
    const candidate = await db
      .prepare('SELECT * FROM noah_discovery_candidates WHERE id=?')
      .bind(id)
      .first<Candidate>();
    if (!candidate || candidate.state !== 'active')
      throw new NoahAgentError(
        '公開候補が見つからないか、提供元で公開が取り下げられています。',
        404,
      );
    if (candidate.checked_at < now() - DISCOVERY_FRESH)
      throw new NoahAgentError(
        '提供元の公開状態の再確認が必要です。次回取込後に読み直してください。',
        409,
      );
    const versions = (
      await db
        .prepare(
          "SELECT revision,digest,metadata_json,observed_at FROM noah_discovery_versions WHERE candidate_id=? AND state='active' ORDER BY revision DESC LIMIT 20",
        )
        .bind(id)
        .all<{
          revision: number;
          digest: string;
          metadata_json: string;
          observed_at: number;
        }>()
    ).results;
    return {
      id,
      checkedAt: candidate.checked_at,
      currentRevision: candidate.revision,
      versions: versions.map((v) => ({
        revision: v.revision,
        digest: v.digest,
        observedAt: v.observed_at,
        metadata: JSON.parse(v.metadata_json) as DiscoveryMetadata,
      })),
    };
  }
  return { sync, list, detail, status, preferences };
}
