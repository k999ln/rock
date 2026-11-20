import { NoahAgentError } from './noah-agent-upload.ts';
import {
  ownerScopeFor,
  OWNER_SCOPE_HEADER,
  rejectChangedOwner,
} from './owner-intent.ts';
import { boundedNoahBody } from './noah-agent-api.ts';
export type AgentFeedbackSummary = {
  agentId: string;
  ownerScope: string | null;
  users: number;
  crowns: number;
  comments: number;
  crowned: boolean;
  revision: number;
};
export type AgentComment = {
  id: string;
  content: string;
  author: string;
  createdAt: number;
  parentId: string | null;
  parentAuthor: string | null;
  parentContent: string | null;
  mine: boolean;
  deleted: boolean;
};
export type AgentFeedbackPage = {
  agentName: string;
  summary: AgentFeedbackSummary;
  comments: AgentComment[];
  cursor: string | null;
  authenticated: boolean;
  canComment: boolean;
};
export type MaintenanceRequest = {
  id: string;
  agentId: string;
  objective: string;
  repository: string;
  state: 'requested';
  createdAt: number;
};
export type FeedbackFeedEntry = {
  id: string;
  agentId: string;
  agentName: string;
  author: string;
  content: string;
  createdAt: number;
  replies: number;
};
export type FeedbackFeedPage = {
  entries: FeedbackFeedEntry[];
  cursor: string | null;
};
type DB = Pick<D1Database, 'prepare'>;
type Deps = {
  db: DB;
  authenticate: (request: Request) => Promise<string>;
  publicAgent: (id: string) => Promise<boolean> | boolean;
  agentName?: (id: string) => Promise<string> | string;
  now?: () => number;
  operators?: string[];
};
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
function fail(message: string, status = 400): never {
  throw new NoahAgentError(message, status);
}
const uuid = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
const agentId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(v);
function text(v: unknown, max: number) {
  if (
    typeof v !== 'string' ||
    !v.trim() ||
    v.length > max ||
    Array.from(v).some((c) => {
      const n = c.charCodeAt(0);
      return (n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127;
    })
  )
    return fail('入力内容を確認してください。');
  return v.trim();
}
async function digest(value: unknown) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(value)),
      ),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
function keys(v: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    fail('送信項目を確認してください。');
}
export function createNoahFeedbackApi(deps: Deps) {
  const db = deps.db,
    now = deps.now ?? Date.now;
  async function publicAgent(id: unknown): Promise<string> {
    if (!agentId(id) || !(await deps.publicAgent(id)))
      return fail('公開Agentが見つかりません。', 404);
    return id;
  }
  async function viewer(r: Request, required = false) {
    try {
      return await deps.authenticate(r);
    } catch (e) {
      if (e instanceof Error && e.message === 'UNAUTHORIZED') {
        if (required)
          fail('評価やコメントを保存するには、本人確認が必要です。', 401);
        return null;
      }
      throw e;
    }
  }
  const profile = (owner: string | null) =>
    owner
      ? db
          .prepare('SELECT id,name FROM sky_social_profiles WHERE owner_id=?')
          .bind(owner)
          .first<{ id: string; name: string }>()
      : Promise.resolve(null);
  async function summary(
    id: string,
    owner: string | null,
  ): Promise<AgentFeedbackSummary> {
    const row = await db
      .prepare(`SELECT
      (SELECT COUNT(DISTINCT owner_id) FROM noah_runner_commands WHERE kind='run' AND state='succeeded' AND json_extract(payload,'$.pin.agentId')=?) AS users,
      (SELECT COUNT(*) FROM noah_agent_crowns WHERE agent_id=? AND enabled=1) AS crowns,
      (SELECT COUNT(*) FROM noah_agent_comments WHERE agent_id=? AND deleted_at IS NULL) AS comments,
      (SELECT enabled FROM noah_agent_crowns WHERE agent_id=? AND owner_id=?) AS crowned,
      (SELECT revision FROM noah_agent_crowns WHERE agent_id=? AND owner_id=?) AS revision`)
      .bind(id, id, id, id, owner, id, owner)
      .first<{
        users: number;
        crowns: number;
        comments: number;
        crowned: number | null;
        revision: number | null;
      }>();
    if (!row) throw Error('stats unavailable');
    return {
      agentId: id,
      ownerScope: owner ? await ownerScopeFor(owner) : null,
      users: row.users,
      crowns: row.crowns,
      comments: row.comments,
      crowned: row.crowned === 1,
      revision: row.revision ?? 0,
    };
  }
  async function page(
    id: string,
    owner: string | null,
    cursor: string | null,
  ): Promise<AgentFeedbackPage> {
    let at = Number.MAX_SAFE_INTEGER,
      last = '~';
    if (cursor) {
      const m = /^(\d{1,16}):([a-f0-9-]{36})$/.exec(cursor);
      if (!m || !Number.isSafeInteger(Number(m[1])) || !uuid(m[2]))
        return fail('続きを読み込む位置を確認してください。');
      at = Number(m[1]);
      last = m[2];
    }
    const rows = await db
      .prepare(`SELECT c.id,c.content,c.created_at,c.parent_id,c.deleted_at,c.owner_id,p.name,
      CASE WHEN parent.deleted_at IS NULL THEN parent.content ELSE '' END AS parent_content,pp.name AS parent_name
      FROM noah_agent_comments c JOIN sky_social_profiles p ON p.id=c.profile_id
      LEFT JOIN noah_agent_comments parent ON parent.id=c.parent_id AND parent.agent_id=c.agent_id
      LEFT JOIN sky_social_profiles pp ON pp.id=parent.profile_id
      WHERE c.agent_id=? AND (c.created_at<? OR (c.created_at=? AND c.id<?)) ORDER BY c.created_at DESC,c.id DESC LIMIT 31`)
      .bind(id, at, at, last)
      .all<{
        id: string;
        content: string;
        created_at: number;
        parent_id: string | null;
        deleted_at: number | null;
        owner_id: string;
        name: string;
        parent_content: string | null;
        parent_name: string | null;
      }>();
    const shown = rows.results.slice(0, 30),
      tail = shown.at(-1),
      p = await profile(owner);
    return {
      agentName: (await deps.agentName?.(id)) ?? id,
      summary: await summary(id, owner),
      authenticated: !!owner,
      canComment: !!p,
      comments: shown.map((r) => ({
        id: r.id,
        content: r.deleted_at === null ? r.content : '',
        author: r.deleted_at === null ? r.name : '',
        createdAt: r.created_at,
        parentId: r.parent_id,
        parentAuthor: r.parent_content ? r.parent_name : null,
        parentContent: r.parent_content,
        mine: r.owner_id === owner,
        deleted: r.deleted_at !== null,
      })),
      cursor:
        rows.results.length > 30 && tail
          ? `${tail.created_at}:${tail.id}`
          : null,
    };
  }
  async function crown(id: string, owner: string, v: Record<string, unknown>) {
    keys(v, ['action', 'agentId', 'id', 'enabled', 'revision']);
    if (
      !uuid(v.id) ||
      typeof v.enabled !== 'boolean' ||
      !Number.isSafeInteger(v.revision) ||
      Number(v.revision) < 0
    )
      fail('評価の状態を確認してください。');
    const value = v.enabled ? 1 : 0;
    const current = () =>
      db
        .prepare(
          'SELECT enabled,revision,request_id FROM noah_agent_crowns WHERE agent_id=? AND owner_id=?',
        )
        .bind(id, owner)
        .first<{ enabled: number; revision: number; request_id: string }>();
    let row = await current();
    if (row && row.request_id === v.id) {
      if (row.enabled !== value)
        fail('同じ要求IDの内容を変更できません。', 409);
      return;
    }
    if ((row?.revision ?? 0) !== v.revision)
      fail('評価が更新されています。再読み込みしてください。', 409);
    if (!row)
      await db
        .prepare(
          `INSERT INTO noah_agent_crowns(agent_id,owner_id,enabled,revision,request_id,updated_at) SELECT ?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM noah_agent_crowns WHERE owner_id=?)<2000 ON CONFLICT(agent_id,owner_id) DO NOTHING`,
        )
        .bind(id, owner, value, v.id, now(), owner)
        .run();
    else
      await db
        .prepare(
          'UPDATE noah_agent_crowns SET enabled=?,revision=revision+1,request_id=?,updated_at=? WHERE agent_id=? AND owner_id=? AND revision=?',
        )
        .bind(value, v.id, now(), id, owner, v.revision)
        .run();
    row = await current();
    if (!row || row.request_id !== v.id || row.enabled !== value)
      fail('評価の状態が変わりました。再読み込みしてください。', 409);
  }
  async function comment(
    id: string,
    owner: string,
    v: Record<string, unknown>,
  ) {
    keys(v, [
      'action',
      'agentId',
      'id',
      'content',
      'parentId',
      'publicConsent',
    ]);
    if (
      !uuid(v.id) ||
      v.publicConsent !== true ||
      (v.parentId !== null && !uuid(v.parentId))
    )
      fail('公開する内容と返信先を確認してください。');
    const content = text(v.content, 1000),
      hash = await digest([id, content, v.parentId]);
    const existing = () =>
      db
        .prepare(
          'SELECT owner_id,agent_id,content_sha256 FROM noah_agent_comments WHERE id=?',
        )
        .bind(v.id)
        .first<{
          owner_id: string;
          agent_id: string;
          content_sha256: string;
        }>();
    const replay = await existing();
    if (replay) {
      if (
        replay.owner_id !== owner ||
        replay.agent_id !== id ||
        replay.content_sha256 !== hash
      )
        fail('投稿IDが使用済みです。', 409);
      return;
    }
    const p = await profile(owner);
    if (!p) fail('コメントするには、公開名を設定してください。', 409);
    if (v.parentId) {
      const parent = await db
        .prepare(
          'SELECT id FROM noah_agent_comments WHERE id=? AND agent_id=? AND parent_id IS NULL AND deleted_at IS NULL',
        )
        .bind(v.parentId, id)
        .first();
      if (!parent) fail('返信先のコメントが見つかりません。', 404);
    }
    await db
      .prepare(`INSERT INTO noah_agent_comments(id,agent_id,owner_id,profile_id,parent_id,content,content_sha256,created_at)
      SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM noah_agent_comments WHERE owner_id=? AND created_at>=?)<20
      AND (? IS NULL OR EXISTS(SELECT 1 FROM noah_agent_comments WHERE id=? AND agent_id=? AND parent_id IS NULL AND deleted_at IS NULL)) ON CONFLICT(id) DO NOTHING`)
      .bind(
        v.id,
        id,
        owner,
        p!.id,
        v.parentId,
        content,
        hash,
        now(),
        owner,
        now() - 3600000,
        v.parentId,
        v.parentId,
        id,
      )
      .run();
    const saved = await existing();
    if (!saved)
      fail(
        '投稿が集中しているか、返信先が変更されました。時間をおいて再試行してください。',
        429,
      );
    if (
      saved.owner_id !== owner ||
      saved.agent_id !== id ||
      saved.content_sha256 !== hash
    )
      fail('投稿IDが使用済みです。', 409);
  }
  async function remove(id: string, owner: string, v: Record<string, unknown>) {
    keys(v, ['action', 'agentId', 'id']);
    if (!uuid(v.id)) fail('コメントを確認してください。');
    const found = await db
      .prepare(
        'SELECT id FROM noah_agent_comments WHERE id=? AND agent_id=? AND owner_id=?',
      )
      .bind(v.id, id, owner)
      .first();
    if (!found) fail('自分のコメントが見つかりません。', 404);
    await db
      .prepare(
        "UPDATE noah_agent_comments SET content='',deleted_at=COALESCE(deleted_at,?) WHERE id=? AND agent_id=? AND owner_id=?",
      )
      .bind(now(), v.id, id, owner)
      .run();
  }
  async function maintenance(owner: string, v: Record<string, unknown>) {
    keys(v, [
      'action',
      'agentId',
      'id',
      'objective',
      'repository',
      'scopeVersion',
      'authorized',
    ]);
    const id = await publicAgent(v.agentId);
    if (
      !uuid(v.id) ||
      v.scopeVersion !== 'noah-maintenance-v1' ||
      v.authorized !== true
    )
      fail('依頼権限と作業範囲を確認してください。');
    const objective = text(v.objective, 2000),
      repository = text(v.repository, 300);
    let url: URL;
    try {
      url = new URL(repository);
    } catch {
      return fail('リポジトリのHTTPS URLを入力してください。');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      fail('認証情報を含まないHTTPS URLを入力してください。');
    const hash = await digest([id, objective, repository, v.scopeVersion]);
    await db
      .prepare(
        `INSERT INTO noah_maintenance_requests(id,owner_id,agent_id,objective,repository,request_sha256,state,scope_version,created_at) SELECT ?,?,?,?,?,?,'requested','noah-maintenance-v1',? WHERE (SELECT COUNT(*) FROM noah_maintenance_requests WHERE owner_id=?)<5 ON CONFLICT(id) DO NOTHING`,
      )
      .bind(v.id, owner, id, objective, repository, hash, now(), owner)
      .run();
    const saved = await db
      .prepare(
        'SELECT id,owner_id,request_sha256 FROM noah_maintenance_requests WHERE id=?',
      )
      .bind(v.id)
      .first<{ owner_id: string; request_sha256: string }>();
    if (!saved) fail('依頼の受付上限に達しました。', 429);
    if (saved!.owner_id !== owner || saved!.request_sha256 !== hash)
      fail('依頼IDが使用済みです。', 409);
    return {
      id: v.id,
      state: 'requested',
      message:
        '見積もり依頼を保存しました。料金・作業範囲の合意と権限確認はこれからです。',
    };
  }
  return async (r: Request) => {
    try {
      if (!['GET', 'POST'].includes(r.method))
        return json({ error: '対応していない操作です。' }, 405);
      if (
        r.method === 'POST' &&
        r.headers.get('origin') !== new URL(r.url).origin
      )
        fail('この画面から操作してください。', 403);
      const u = new URL(r.url),
        owner = await viewer(
          r,
          r.method === 'POST' || u.searchParams.has('maintenance'),
        );
      if (r.method === 'GET') {
        if (u.searchParams.has('feed')) {
          let at = Number.MAX_SAFE_INTEGER,
            last = '~';
          const cursor = u.searchParams.get('cursor');
          if (cursor) {
            const m = /^(\d{1,16}):([a-f0-9-]{36})$/.exec(cursor);
            if (!m || !Number.isSafeInteger(Number(m[1])) || !uuid(m[2]))
              fail('続きを読み込む位置を確認してください。');
            at = Number(m![1]);
            last = m![2];
          }
          const rows = await db
            .prepare(`SELECT c.id,c.agent_id,p.name,c.content,c.created_at,
            (SELECT COUNT(*) FROM noah_agent_comments reply WHERE reply.parent_id=c.id AND reply.deleted_at IS NULL) AS replies
            FROM noah_agent_comments c JOIN sky_social_profiles p ON p.id=c.profile_id
            WHERE c.parent_id IS NULL AND c.deleted_at IS NULL AND (c.created_at<? OR (c.created_at=? AND c.id<?))
            ORDER BY c.created_at DESC,c.id DESC LIMIT 31`)
            .bind(at, at, last)
            .all<{
              id: string;
              agent_id: string;
              name: string;
              content: string;
              created_at: number;
              replies: number;
            }>();
          const entries: FeedbackFeedEntry[] = [];
          for (const row of rows.results.slice(0, 30))
            if (await deps.publicAgent(row.agent_id))
              entries.push({
                id: row.id,
                agentId: row.agent_id,
                agentName: (await deps.agentName?.(row.agent_id)) ?? 'Agent',
                author: row.name,
                content: row.content,
                createdAt: row.created_at,
                replies: row.replies,
              });
          const tail = rows.results[29];
          return json({
            entries,
            cursor:
              rows.results.length > 30 ? `${tail.created_at}:${tail.id}` : null,
          });
        }

        if (u.searchParams.has('maintenance')) {
          const operator = u.searchParams.get('maintenance') === 'operator';
          if (operator && !deps.operators?.includes(owner!))
            fail('運営の権限が必要です。', 403);
          const rows = await db
            .prepare(
              `SELECT id,agent_id AS agentId,objective,repository,state,created_at AS createdAt FROM noah_maintenance_requests ${operator ? '' : 'WHERE owner_id=?'} ORDER BY created_at DESC,id DESC LIMIT 50`,
            )
            .bind(...(operator ? [] : [owner]))
            .all<MaintenanceRequest>();
          return json({
            requests: rows.results,
            ownerScope: await ownerScopeFor(owner!),
          });
        }
        if (u.searchParams.has('ids')) {
          const ids = [
            ...new Set((u.searchParams.get('ids') ?? '').split(',')),
          ];
          if (!ids.length || ids.length > 20)
            fail('一度に確認できるAgentは20件です。');
          for (const id of ids) await publicAgent(id);
          return json({
            summaries: await Promise.all(ids.map((id) => summary(id, owner))),
          });
        }
        const id = await publicAgent(u.searchParams.get('agent'));
        return json(await page(id, owner, u.searchParams.get('cursor')));
      }
      if (!r.headers.has(OWNER_SCOPE_HEADER))
        fail('アカウントの状態を再読み込みしてください。', 409);
      const changed = await rejectChangedOwner(r, owner!);
      if (changed) return changed;
      if (!r.headers.get('content-type')?.startsWith('application/json'))
        fail('JSONで送信してください。', 415);
      const raw: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          await boundedNoahBody(r, 12000),
        ),
      );
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        fail('入力内容を確認してください。');
      const v = raw as Record<string, unknown>;
      if (v.action === 'maintenance')
        return json(await maintenance(owner!, v), 201);
      const id = await publicAgent(v.agentId);
      if (v.action === 'crown') await crown(id, owner!, v);
      else if (v.action === 'comment') await comment(id, owner!, v);
      else if (v.action === 'remove') await remove(id, owner!, v);
      else fail('操作を確認してください。');
      return json({ summary: await summary(id, owner) });
    } catch (e) {
      if (e instanceof NoahAgentError)
        return json({ error: e.message }, e.status);
      if (e instanceof SyntaxError || e instanceof TypeError)
        return json({ error: '入力内容を確認してください。' }, 400);
      return json(
        { error: '現在読み込めません。時間をおいて再試行してください。' },
        503,
      );
    }
  };
}
