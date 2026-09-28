import {
  CampusError,
  CAMPUSES,
  campusFromTagPrefix,
  type CampusId,
  type CampusItemInput,
  type CampusItemKind,
  type CampusProfileInput,
  type CampusPublicProfile,
  matchCampusProfiles,
} from './campus';

type Db = Pick<D1Database, 'prepare' | 'batch'>;
type ProfileRow = {
  id: string;
  userId: string;
  campusId: CampusId;
  handle: string;
  displayName: string;
  affiliation: CampusProfileInput['affiliation'];
  affiliationStatus: 'self_declared' | 'domain_verified';
  headline: string;
  bio: string;
  skillsJson: string;
  interestsJson: string;
  lookingForJson: string;
  linksJson: string;
  isPublic: number;
  createdAt: string;
  updatedAt: string;
};
type ItemRow = {
  id: string;
  ownerUserId: string;
  campusId: CampusId;
  kind: CampusItemKind;
  title: string;
  summary: string;
  tagsJson: string;
  detailsJson: string;
  status: 'active' | 'archived';
  visibility: 'campus' | 'public';
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const profileColumns = `id, user_id AS userId, campus_id AS campusId, handle,
  display_name AS displayName, affiliation, affiliation_status AS affiliationStatus,
  headline, bio, skills_json AS skillsJson, interests_json AS interestsJson,
  looking_for_json AS lookingForJson, links_json AS linksJson, is_public AS isPublic,
  created_at AS createdAt, updated_at AS updatedAt`;
const itemColumns = `id, owner_user_id AS ownerUserId, campus_id AS campusId, kind,
  title, summary, tags_json AS tagsJson, details_json AS detailsJson, status,
  visibility, starts_at AS startsAt, ends_at AS endsAt,
  created_at AS createdAt, updated_at AS updatedAt`;

function parsed<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
function publicProfile(row: ProfileRow): CampusPublicProfile {
  return {
    id: row.id,
    campusId: row.campusId,
    handle: row.handle,
    displayName: row.displayName,
    affiliation: row.affiliation,
    affiliationStatus: row.affiliationStatus,
    headline: row.headline,
    bio: row.bio,
    skills: parsed<string[]>(row.skillsJson, []),
    interests: parsed<string[]>(row.interestsJson, []),
    lookingFor: parsed<string[]>(row.lookingForJson, []),
    links: parsed(row.linksJson, []),
    updatedAt: row.updatedAt,
  };
}
function item(row: ItemRow, owned = false) {
  return {
    id: row.id,
    campusId: row.campusId,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    tags: parsed<string[]>(row.tagsJson, []),
    details: parsed<Record<string, unknown>>(row.detailsJson, {}),
    status: row.status,
    visibility: row.visibility,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    owned,
  };
}
function now() {
  return new Date().toISOString();
}
function uuid() {
  return crypto.randomUUID();
}
function statement(db: Db, sql: string, ...args: (string | number | null)[]) {
  return db.prepare(sql).bind(...args);
}

export function campusStore(db: Db) {
  async function profileForUser(user: string, campus: CampusId) {
    return statement(
      db,
      `SELECT ${profileColumns} FROM sky_campus_profiles
       WHERE user_id = ? AND campus_id = ?`,
      user,
      campus,
    ).first<ProfileRow>();
  }

  async function profileById(id: string) {
    return statement(
      db,
      `SELECT ${profileColumns} FROM sky_campus_profiles WHERE id = ?`,
      id,
    ).first<ProfileRow>();
  }

  async function listProfiles(campus: CampusId, viewer: string | null, limit = 80) {
    const rows = (
      await statement(
        db,
        `SELECT ${profileColumns} FROM sky_campus_profiles
         WHERE campus_id = ? AND is_public = 1
         ORDER BY updated_at DESC, id DESC LIMIT ?`,
        campus,
        Math.min(100, Math.max(1, limit)),
      ).all<ProfileRow>()
    ).results;
    if (!viewer) return rows.map(publicProfile);
    const own = await profileForUser(viewer, campus);
    const mine = (
      await statement(
        db,
        `SELECT target_id AS id FROM sky_campus_edges
         WHERE actor_user_id = ? AND campus_id = ? AND edge_type = 'block'
           AND target_type = 'profile' AND status = 'accepted'`,
        viewer,
        campus,
      ).all<{ id: string }>()
    ).results.map((row) => row.id);
    const blockedMe = own
      ? (
          await statement(
            db,
            `SELECT p.id
             FROM sky_campus_edges e
             JOIN sky_campus_profiles p
               ON p.user_id = e.actor_user_id AND p.campus_id = e.campus_id
             WHERE e.campus_id = ? AND e.edge_type = 'block'
               AND e.target_type = 'profile' AND e.target_id = ?
               AND e.status = 'accepted'`,
            campus,
            own.id,
          ).all<{ id: string }>()
        ).results.map((row) => row.id)
      : [];
    const blocked = new Set([...mine, ...blockedMe]);
    return rows.filter((row) => !blocked.has(row.id)).map(publicProfile);
  }

  async function upsertProfile(
    user: string,
    input: CampusProfileInput,
    domainVerified: boolean,
  ) {
    const existing = await profileForUser(user, input.campusId);
    const id = existing?.id ?? uuid();
    const timestamp = now();
    try {
      await statement(
        db,
        `INSERT INTO sky_campus_profiles
          (id, user_id, campus_id, handle, display_name, affiliation,
           affiliation_status, headline, bio, skills_json, interests_json,
           looking_for_json, links_json, is_public, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, campus_id) DO UPDATE SET
           handle = excluded.handle,
           display_name = excluded.display_name,
           affiliation = excluded.affiliation,
           affiliation_status = excluded.affiliation_status,
           headline = excluded.headline,
           bio = excluded.bio,
           skills_json = excluded.skills_json,
           interests_json = excluded.interests_json,
           looking_for_json = excluded.looking_for_json,
           links_json = excluded.links_json,
           is_public = excluded.is_public,
           updated_at = excluded.updated_at`,
        id,
        user,
        input.campusId,
        input.handle,
        input.displayName,
        input.affiliation,
        domainVerified ? 'domain_verified' : 'self_declared',
        input.headline,
        input.bio,
        JSON.stringify(input.skills),
        JSON.stringify(input.interests),
        JSON.stringify(input.lookingFor),
        JSON.stringify(input.links),
        Number(input.isPublic),
        existing?.createdAt ?? timestamp,
        timestamp,
      ).run();
    } catch (error) {
      if (error instanceof Error && /UNIQUE|constraint/i.test(error.message))
        throw new CampusError('そのハンドルはすでに使われています。', 409);
      throw error;
    }
    const saved = await profileForUser(user, input.campusId);
    if (!saved) throw new CampusError('プロフィールを保存できませんでした。', 503);
    return { ...publicProfile(saved), isPublic: Boolean(saved.isPublic) };
  }

  async function listItems(
    campus: CampusId,
    kind?: CampusItemKind,
    viewer?: string | null,
  ) {
    const kindClause = kind ? 'AND kind = ?' : '';
    const visibilityClause = viewer ? '' : "AND visibility = 'public'";
    const args: (string | number | null)[] = kind ? [campus, kind] : [campus];
    const rows = (
      await statement(
        db,
        `SELECT ${itemColumns} FROM sky_campus_items
         WHERE campus_id = ? AND status = 'active' ${kindClause} ${visibilityClause}
         ORDER BY
           CASE WHEN kind = 'event' AND starts_at IS NOT NULL THEN 0 ELSE 1 END,
           starts_at ASC, updated_at DESC
         LIMIT 200`,
        ...args,
      ).all<ItemRow>()
    ).results;
    return rows.map((row) => item(row, Boolean(viewer && row.ownerUserId === viewer)));
  }

  async function createItem(user: string, input: CampusItemInput) {
    const count = await statement(
      db,
      `SELECT COUNT(*) AS total FROM sky_campus_items
       WHERE owner_user_id = ? AND campus_id = ? AND status = 'active'`,
      user,
      input.campusId,
    ).first<{ total: number }>();
    if ((count?.total ?? 0) >= 300)
      throw new CampusError('このCampusで作成できる項目の上限に達しました。', 409);
    const id = uuid();
    const timestamp = now();
    await statement(
      db,
      `INSERT INTO sky_campus_items
       (id, owner_user_id, campus_id, kind, title, summary, tags_json,
        details_json, status, visibility, starts_at, ends_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
      id,
      user,
      input.campusId,
      input.kind,
      input.title,
      input.summary,
      JSON.stringify(input.tags),
      JSON.stringify(input.details),
      input.visibility,
      input.startsAt,
      input.endsAt,
      timestamp,
      timestamp,
    ).run();
    return item((await statement(
      db,
      `SELECT ${itemColumns} FROM sky_campus_items WHERE id = ? AND owner_user_id = ?`,
      id,
      user,
    ).first<ItemRow>())!, true);
  }

  async function updateItem(user: string, id: string, input: CampusItemInput) {
    const result = await statement(
      db,
      `UPDATE sky_campus_items SET campus_id = ?, kind = ?, title = ?, summary = ?,
       tags_json = ?, details_json = ?, visibility = ?, starts_at = ?, ends_at = ?,
       updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND status = 'active' RETURNING id`,
      input.campusId,
      input.kind,
      input.title,
      input.summary,
      JSON.stringify(input.tags),
      JSON.stringify(input.details),
      input.visibility,
      input.startsAt,
      input.endsAt,
      now(),
      id,
      user,
    ).all();
    if (!result.results.length) throw new CampusError('項目が見つかりません。', 404);
    const saved = await statement(
      db,
      `SELECT ${itemColumns} FROM sky_campus_items WHERE id = ? AND owner_user_id = ?`,
      id,
      user,
    ).first<ItemRow>();
    return item(saved!, true);
  }

  async function archiveItem(user: string, id: string) {
    const result = await statement(
      db,
      `UPDATE sky_campus_items SET status = 'archived', updated_at = ?
       WHERE id = ? AND owner_user_id = ? AND status = 'active' RETURNING id`,
      now(),
      id,
      user,
    ).all();
    if (!result.results.length) throw new CampusError('項目が見つかりません。', 404);
    return { id, archived: true };
  }

  async function targetExists(campus: CampusId, type: string, id: string) {
    if (type === 'profile')
      return Boolean(
        await statement(
          db,
          `SELECT id FROM sky_campus_profiles WHERE id = ? AND campus_id = ? AND is_public = 1`,
          id,
          campus,
        ).first(),
      );
    if (type === 'item')
      return Boolean(
        await statement(
          db,
          `SELECT id FROM sky_campus_items WHERE id = ? AND campus_id = ? AND status = 'active'`,
          id,
          campus,
        ).first(),
      );
    return false;
  }

  async function setEdge(
    user: string,
    campus: CampusId,
    edgeType: 'follow' | 'save' | 'collaborator_request' | 'join' | 'block',
    targetType: 'profile' | 'item',
    targetId: string,
    note: string,
  ) {
    if (!(await targetExists(campus, targetType, targetId)))
      throw new CampusError('対象が見つかりません。', 404);
    const ownProfile = await profileForUser(user, campus);
    if (targetType === 'profile' && ownProfile?.id === targetId)
      throw new CampusError('自分自身にはこの操作を実行できません。');

    let status = ['follow', 'save', 'block'].includes(edgeType) ? 'accepted' : 'pending';
    if (edgeType === 'join' && targetType === 'item') {
      const row = await statement(
        db,
        `SELECT kind, details_json AS detailsJson FROM sky_campus_items WHERE id = ?`,
        targetId,
      ).first<{ kind: string; detailsJson: string }>();
      if (row?.kind !== 'community') throw new CampusError('コミュニティを選択してください。');
      const details = parsed<Record<string, unknown>>(row.detailsJson, {});
      if (details.joinPolicy === 'open') status = 'accepted';
    }
    const existing = await statement(
      db,
      `SELECT id FROM sky_campus_edges
       WHERE actor_user_id = ? AND edge_type = ? AND target_type = ? AND target_id = ?`,
      user,
      edgeType,
      targetType,
      targetId,
    ).first<{ id: string }>();
    const id = existing?.id ?? uuid();
    const timestamp = now();
    await statement(
      db,
      `INSERT INTO sky_campus_edges
       (id, actor_user_id, campus_id, edge_type, target_type, target_id,
        note, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(actor_user_id, edge_type, target_type, target_id) DO UPDATE SET
        note = excluded.note, status = excluded.status, updated_at = excluded.updated_at`,
      id,
      user,
      campus,
      edgeType,
      targetType,
      targetId,
      note,
      status,
      timestamp,
      timestamp,
    ).run();
    return { id, campusId: campus, edgeType, targetType, targetId, note, status, updatedAt: timestamp };
  }

  async function removeEdge(user: string, id: string) {
    const result = await statement(
      db,
      'DELETE FROM sky_campus_edges WHERE id = ? AND actor_user_id = ? RETURNING id',
      id,
      user,
    ).all();
    if (!result.results.length) throw new CampusError('接続が見つかりません。', 404);
    return { id, removed: true };
  }

  async function outgoingEdges(user: string, campus: CampusId) {
    return (
      await statement(
        db,
        `SELECT e.id, e.edge_type AS edgeType, e.target_type AS targetType,
          e.target_id AS targetId, e.note, e.status, e.created_at AS createdAt,
          e.updated_at AS updatedAt,
          COALESCE(p.display_name, i.title, e.target_id) AS targetLabel
         FROM sky_campus_edges e
         LEFT JOIN sky_campus_profiles p
           ON e.target_type = 'profile' AND p.id = e.target_id
         LEFT JOIN sky_campus_items i
           ON e.target_type = 'item' AND i.id = e.target_id
         WHERE e.actor_user_id = ? AND e.campus_id = ?
         ORDER BY e.updated_at DESC LIMIT 500`,
        user,
        campus,
      ).all<{
        id: string;
        edgeType: string;
        targetType: string;
        targetId: string;
        targetLabel: string;
        note: string;
        status: string;
        createdAt: string;
        updatedAt: string;
      }>()
    ).results;
  }

  async function inbox(user: string, campus: CampusId) {
    const rows = (
      await statement(
        db,
        `SELECT e.id, e.edge_type AS edgeType, e.target_type AS targetType,
          e.target_id AS targetId, e.note, e.status, e.created_at AS createdAt,
          p.id AS actorProfileId, p.handle AS actorHandle,
          p.display_name AS actorDisplayName, p.headline AS actorHeadline
         FROM sky_campus_edges e
         LEFT JOIN sky_campus_profiles p
           ON p.user_id = e.actor_user_id AND p.campus_id = e.campus_id
         LEFT JOIN sky_campus_profiles target_profile
           ON e.target_type = 'profile' AND target_profile.id = e.target_id
         LEFT JOIN sky_campus_items target_item
           ON e.target_type = 'item' AND target_item.id = e.target_id
         WHERE e.campus_id = ? AND e.status = 'pending'
           AND (target_profile.user_id = ? OR target_item.owner_user_id = ?)
         ORDER BY e.created_at DESC LIMIT 100`,
        campus,
        user,
        user,
      ).all<{
        id: string;
        edgeType: string;
        targetType: string;
        targetId: string;
        note: string;
        status: string;
        createdAt: string;
        actorProfileId: string | null;
        actorHandle: string | null;
        actorDisplayName: string | null;
        actorHeadline: string | null;
      }>()
    ).results;
    return rows.map((row) => ({
      ...row,
      actor: row.actorProfileId
        ? {
            id: row.actorProfileId,
            handle: row.actorHandle,
            displayName: row.actorDisplayName,
            headline: row.actorHeadline,
          }
        : null,
    }));
  }

  async function respondEdge(user: string, id: string, decision: 'accepted' | 'declined') {
    const result = await statement(
      db,
      `UPDATE sky_campus_edges SET status = ?, updated_at = ?
       WHERE id = ? AND status = 'pending' AND (
         EXISTS (
           SELECT 1 FROM sky_campus_profiles p
           WHERE sky_campus_edges.target_type = 'profile'
             AND p.id = sky_campus_edges.target_id AND p.user_id = ?
         )
         OR EXISTS (
           SELECT 1 FROM sky_campus_items i
           WHERE sky_campus_edges.target_type = 'item'
             AND i.id = sky_campus_edges.target_id AND i.owner_user_id = ?
         )
       ) RETURNING id`,
      decision,
      now(),
      id,
      user,
      user,
    ).all();
    if (!result.results.length) throw new CampusError('リクエストが見つかりません。', 404);
    return { id, status: decision };
  }

  async function registerTagBatch(
    user: string,
    campus: CampusId,
    input: {
      prefix: string;
      start: number;
      count: number;
      mode: string;
      label: string;
      placement: string;
    },
  ) {
    if (!new RegExp(`^${campus}(?:-[a-z0-9]+)*$`).test(input.prefix))
      throw new CampusError(`タグprefixは「${campus}」から始めてください。`);
    if (!Number.isSafeInteger(input.start) || input.start < 1 || input.start > 999999)
      throw new CampusError('開始番号を確認してください。');
    if (!Number.isSafeInteger(input.count) || input.count < 1 || input.count > 200)
      throw new CampusError('1回に登録できるタグは1〜200枚です。');
    const owned = await statement(
      db,
      'SELECT COUNT(*) AS total FROM sky_campus_tags WHERE owner_user_id = ?',
      user,
    ).first<{ total: number }>();
    if ((owned?.total ?? 0) + input.count > 2000)
      throw new CampusError('登録できるタグは合計2,000枚までです。', 409);

    const timestamp = now();
    const records = Array.from({ length: input.count }, (_, index) => {
      const number = String(input.start + index).padStart(4, '0');
      const tagId = `${input.prefix}-${number}`;
      const destination = `/campus?campus=${campus}&mode=${encodeURIComponent(input.mode)}&tag=${tagId}`;
      return { tagId, destination };
    });
    const results = await db.batch(
      records.map(({ tagId, destination }) =>
        statement(
          db,
          `INSERT INTO sky_campus_tags
           (tag_id, owner_user_id, campus_id, mode, destination, label, placement,
            active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(tag_id) DO UPDATE SET
             campus_id = excluded.campus_id, mode = excluded.mode,
             destination = excluded.destination, label = excluded.label,
             placement = excluded.placement, active = 1, updated_at = excluded.updated_at
           WHERE sky_campus_tags.owner_user_id = excluded.owner_user_id
           RETURNING tag_id`,
          tagId,
          user,
          campus,
          input.mode,
          destination,
          input.label,
          input.placement,
          timestamp,
          timestamp,
        ),
      ),
    );
    if (results.some((result) => !result.results.length))
      throw new CampusError('別のアカウントが所有するタグIDと重複しています。', 409);
    return records.map((record) => ({
      ...record,
      campusId: campus,
      mode: input.mode,
      nfcPath: `/t/${record.tagId}?source=nfc`,
      qrPath: `/t/${record.tagId}?source=qr`,
    }));
  }

  async function setTagActive(user: string, tagId: string, active: boolean) {
    const result = await statement(
      db,
      `UPDATE sky_campus_tags SET active = ?, updated_at = ?
       WHERE tag_id = ? AND owner_user_id = ? RETURNING tag_id`,
      Number(active),
      now(),
      tagId,
      user,
    ).all();
    if (!result.results.length) throw new CampusError('タグが見つかりません。', 404);
    return { tagId, active };
  }

  async function clearTagAnalytics(user: string, tagId: string) {
    const owned = await statement(
      db,
      'SELECT tag_id FROM sky_campus_tags WHERE tag_id = ? AND owner_user_id = ?',
      tagId,
      user,
    ).first();
    if (!owned) throw new CampusError('タグが見つかりません。', 404);
    const result = await statement(
      db,
      'DELETE FROM sky_campus_tag_events WHERE tag_id = ?',
      tagId,
    ).run();
    return { tagId, deletedEvents: result.meta.changes };
  }

  async function tagAnalytics(user: string, campus: CampusId) {
    return (
      await statement(
        db,
        `SELECT t.tag_id AS tagId, t.mode, t.label, t.placement, t.destination,
          t.active, t.created_at AS createdAt,
          COUNT(e.id) AS total,
          SUM(CASE WHEN e.source = 'nfc' THEN 1 ELSE 0 END) AS nfc,
          SUM(CASE WHEN e.source = 'qr' THEN 1 ELSE 0 END) AS qr,
          SUM(CASE WHEN e.source = 'link' THEN 1 ELSE 0 END) AS link,
          MAX(e.occurred_at) AS lastTap
         FROM sky_campus_tags t
         LEFT JOIN sky_campus_tag_events e ON e.tag_id = t.tag_id
         WHERE t.owner_user_id = ? AND t.campus_id = ?
         GROUP BY t.tag_id
         ORDER BY t.created_at DESC, t.tag_id DESC LIMIT 500`,
        user,
        campus,
      ).all<{
        tagId: string;
        mode: string;
        label: string;
        placement: string;
        destination: string;
        active: number;
        createdAt: string;
        total: number;
        nfc: number | null;
        qr: number | null;
        link: number | null;
        lastTap: string | null;
      }>()
    ).results.map((row) => ({
      ...row,
      active: Boolean(row.active),
      total: Number(row.total ?? 0),
      nfc: Number(row.nfc ?? 0),
      qr: Number(row.qr ?? 0),
      link: Number(row.link ?? 0),
    }));
  }

  async function resolveTag(tagId: string) {
    const row = await statement(
      db,
      `SELECT tag_id AS tagId, campus_id AS campusId, mode, destination, active
       FROM sky_campus_tags WHERE tag_id = ? AND active = 1`,
      tagId,
    ).first<{ tagId: string; campusId: CampusId; mode: string; destination: string; active: number }>();
    if (row) return row;
    const fallback = campusFromTagPrefix(tagId);
    return fallback
      ? {
          tagId,
          campusId: fallback,
          mode: CAMPUSES[fallback].defaultMode,
          destination: `/campus?campus=${fallback}&mode=${CAMPUSES[fallback].defaultMode}&tag=${tagId}&unregistered=1`,
          active: 0,
        }
      : null;
  }

  async function recordTagEvent(tagId: string, source: 'nfc' | 'qr' | 'link') {
    const registered = await statement(
      db,
      'SELECT tag_id AS tagId FROM sky_campus_tags WHERE tag_id = ? AND active = 1',
      tagId,
    ).first();
    if (!registered) return false;
    await statement(
      db,
      `INSERT INTO sky_campus_tag_events (id, tag_id, source, occurred_at)
       VALUES (?, ?, ?, ?)`,
      uuid(),
      tagId,
      source,
      now(),
    ).run();
    return true;
  }

  async function report(
    user: string,
    campus: CampusId,
    targetType: 'profile' | 'item',
    targetId: string,
    reason: string,
    detail: string,
  ) {
    if (!(await targetExists(campus, targetType, targetId)))
      throw new CampusError('報告対象が見つかりません。', 404);
    const allowed = ['spam', 'harassment', 'impersonation', 'unsafe', 'illegal', 'other'];
    if (!allowed.includes(reason)) throw new CampusError('報告理由を確認してください。');
    const timestamp = now();
    const existing = await statement(
      db,
      `SELECT id FROM sky_campus_reports
       WHERE reporter_user_id = ? AND target_type = ? AND target_id = ?`,
      user,
      targetType,
      targetId,
    ).first<{ id: string }>();
    const id = existing?.id ?? uuid();
    await statement(
      db,
      `INSERT INTO sky_campus_reports
       (id, reporter_user_id, campus_id, target_type, target_id, reason, detail,
        status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
       ON CONFLICT(reporter_user_id, target_type, target_id) DO UPDATE SET
        reason = excluded.reason, detail = excluded.detail,
        status = 'open', updated_at = excluded.updated_at`,
      id,
      user,
      campus,
      targetType,
      targetId,
      reason,
      detail,
      timestamp,
      timestamp,
    ).run();
    return { id, status: 'open' };
  }

  async function leaveCampus(user: string, campus: CampusId) {
    const profile = await profileForUser(user, campus);
    const ownedItems = (
      await statement(
        db,
        'SELECT id FROM sky_campus_items WHERE owner_user_id = ? AND campus_id = ?',
        user,
        campus,
      ).all<{ id: string }>()
    ).results;
    const itemIds = ownedItems.map((row) => row.id);
    const operations: D1PreparedStatement[] = [
      statement(
        db,
        `DELETE FROM sky_campus_tag_events WHERE tag_id IN (
          SELECT tag_id FROM sky_campus_tags WHERE owner_user_id = ? AND campus_id = ?
        )`,
        user,
        campus,
      ),
      statement(
        db,
        'DELETE FROM sky_campus_tags WHERE owner_user_id = ? AND campus_id = ?',
        user,
        campus,
      ),
      statement(
        db,
        'DELETE FROM sky_campus_edges WHERE actor_user_id = ? AND campus_id = ?',
        user,
        campus,
      ),
      statement(
        db,
        'DELETE FROM sky_campus_reports WHERE reporter_user_id = ? AND campus_id = ?',
        user,
        campus,
      ),
    ];
    if (profile)
      operations.push(
        statement(
          db,
          "DELETE FROM sky_campus_edges WHERE target_type = 'profile' AND target_id = ?",
          profile.id,
        ),
        statement(
          db,
          "DELETE FROM sky_campus_reports WHERE target_type = 'profile' AND target_id = ?",
          profile.id,
        ),
      );
    for (const id of itemIds)
      operations.push(
        statement(
          db,
          "DELETE FROM sky_campus_edges WHERE target_type = 'item' AND target_id = ?",
          id,
        ),
        statement(
          db,
          "DELETE FROM sky_campus_reports WHERE target_type = 'item' AND target_id = ?",
          id,
        ),
      );
    operations.push(
      statement(
        db,
        'DELETE FROM sky_campus_items WHERE owner_user_id = ? AND campus_id = ?',
        user,
        campus,
      ),
      statement(
        db,
        'DELETE FROM sky_campus_profiles WHERE user_id = ? AND campus_id = ?',
        user,
        campus,
      ),
    );
    await db.batch(operations);
    return { campusId: campus, deleted: true };
  }

  async function bootstrap(user: string | null, campus: CampusId) {
    const [people, items] = await Promise.all([
      listProfiles(campus, user),
      listItems(campus, undefined, user),
    ]);
    if (!user)
      return {
        campus: CAMPUSES[campus],
        profile: null,
        people,
        matches: [],
        items,
        inbox: [],
        myEdges: [],
      };
    const own = await profileForUser(user, campus);
    const profile = own
      ? { ...publicProfile(own), isPublic: Boolean(own.isPublic) }
      : null;
    const [requests, myEdges] = await Promise.all([
      inbox(user, campus),
      outgoingEdges(user, campus),
    ]);
    return {
      campus: CAMPUSES[campus],
      profile,
      people,
      matches: own ? matchCampusProfiles(publicProfile(own), people).slice(0, 20) : [],
      items,
      inbox: requests,
      myEdges,
    };
  }

  return {
    bootstrap,
    profileForUser,
    upsertProfile,
    listProfiles,
    listItems,
    createItem,
    updateItem,
    archiveItem,
    setEdge,
    removeEdge,
    inbox,
    outgoingEdges,
    respondEdge,
    registerTagBatch,
    setTagActive,
    clearTagAnalytics,
    tagAnalytics,
    resolveTag,
    recordTagEvent,
    report,
    leaveCampus,
    profileById,
  };
}
