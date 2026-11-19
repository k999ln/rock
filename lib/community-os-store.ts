import {
  communityKeyHash,
  requireCommunityKey,
  unlockedCommunities,
  type CommunityKeys,
} from './community-access.ts';
import {
  communityOsDraft,
  communityOsAgentTemplates,
  parseCommunityOsManifest,
  type CommunityOsManifest,
} from './community-os.ts';
import { SkySocialError, socialId, socialObject } from './sky-social.ts';
import { skyAgentLibraryStore } from './sky-agent-library-store.ts';
import { SKY_CONSENT_VERSION } from './operations.ts';
type DB = Pick<D1Database, 'prepare' | 'batch'>;
type Ref = { templateId: string; id: string };
type InstallRow = {
  community_id: string;
  version: number;
  revision: number;
  manifest: string;
  agent_refs: string;
  active: number;
  save_token: string;
};
async function agentId(
  owner: string,
  community: string,
  version: number,
  template: string,
) {
  const h = await communityKeyHash(
    JSON.stringify([owner, community, version, template]),
  );
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function communityOsStore(db: DB, owner: string, keys: CommunityKeys) {
  const installed = (id: string) =>
    db
      .prepare(
        'SELECT * FROM sky_community_installs WHERE owner_id=? AND community_id=?',
      )
      .bind(owner, id)
      .first<InstallRow>();
  async function activeId() {
    return (
      (
        await db
          .prepare(
            'SELECT community_id FROM sky_community_installs WHERE owner_id=? AND active=1',
          )
          .bind(owner)
          .first<{ community_id: string }>()
      )?.community_id ?? ''
    );
  }
  async function view(row: InstallRow) {
    const agents = await skyAgentLibraryStore(db, owner).list(),
      refs = JSON.parse(row.agent_refs) as Ref[];
    return {
      communityId: row.community_id,
      version: row.version,
      revision: row.revision,
      manifest: parseCommunityOsManifest(JSON.parse(row.manifest)),
      active: row.active === 1,
      agents: refs.map((ref) => ({
        templateId: ref.templateId,
        agent: agents.find((a) => a.id === ref.id) ?? null,
      })),
    };
  }
  async function state() {
    const p = await db
        .prepare('SELECT id FROM sky_social_profiles WHERE owner_id=?')
        .bind(owner)
        .first<{ id: string }>(),
      allowed = p ? await unlockedCommunities(db, p.id, keys) : [];
    const rows = await db
      .prepare(
        'SELECT * FROM sky_community_installs WHERE owner_id=? AND version>0 ORDER BY updated_at DESC',
      )
      .bind(owner)
      .all<InstallRow>();
    const installs = await Promise.all(
      rows.results.filter((r) => allowed.includes(r.community_id)).map(view),
    );
    return {
      profileId: p?.id ?? null,
      installs,
      active: installs.find((r) => r.active) ?? null,
      activeId: await activeId(),
      locked: rows.results
        .filter((r) => !allowed.includes(r.community_id))
        .map((r) => ({ communityId: r.community_id, revision: r.revision })),
    };
  }
  async function edition(id: string, version = 0) {
    const { community } = await requireCommunityKey(
      db,
      owner,
      socialId(id),
      keys,
    );
    if (!Number.isSafeInteger(version) || version < 0)
      throw new SkySocialError('OS版を確認してください。');
    const rows = await db
      .prepare(
        'SELECT version,digest,created_at FROM sky_community_editions WHERE community_id=? ORDER BY version DESC LIMIT 50',
      )
      .bind(id)
      .all<{ version: number; digest: string; created_at: number }>();
    const row = await db
      .prepare(
        'SELECT manifest,digest FROM sky_community_editions WHERE community_id=? AND version=?',
      )
      .bind(id, version || rows.results[0]?.version || 0)
      .first<{ manifest: string; digest: string }>();
    const members =
      community.owner_id === owner
        ? (
            await db
              .prepare(
                'SELECT p.id,p.name,k.revoked_at AS revokedAt,EXISTS(SELECT 1 FROM sky_community_members m WHERE m.community_id=k.community_id AND m.profile_id=k.profile_id) AS joined FROM sky_community_keys k JOIN sky_social_profiles p ON p.id=k.profile_id WHERE k.community_id=? AND p.owner_id<>? LIMIT 100',
              )
              .bind(id, owner)
              .all<{
                id: string;
                name: string;
                revokedAt: number;
                joined: number;
              }>()
          ).results
        : [];
    return {
      edition: row
        ? {
            manifest: parseCommunityOsManifest(JSON.parse(row.manifest)),
            digest: row.digest,
          }
        : null,
      versions: rows.results,
      installed: await installed(id).then((r) =>
        r && r.version ? view(r) : null,
      ),
      activeId: await activeId(),
      members,
    };
  }
  async function mutate(raw: unknown) {
    const v = socialObject(raw, [
      'action',
      'communityId',
      'draft',
      'expectedVersion',
      'version',
      'digest',
      'revision',
      'approve',
      'expectedActive',
    ]);
    const id = socialId(v.communityId);
    if (v.action === 'publish') {
      const { community } = await requireCommunityKey(
        db,
        owner,
        id,
        keys,
        true,
      );
      if (
        !Number.isSafeInteger(v.expectedVersion) ||
        v.expectedVersion !== community.os_revision
      )
        throw new SkySocialError('別の画面でOS構成が更新されました。', 409);
      const draft = communityOsDraft(v.draft),
        version = community.os_revision + 1,
        manifest: CommunityOsManifest = {
          schema: 'rockstar-community-os/1',
          communityId: id,
          version,
          ...draft,
        };
      communityOsAgentTemplates(manifest);
      const payload = JSON.stringify(manifest),
        digest = await communityKeyHash(payload),
        now = Date.now();
      const result = await db.batch([
        db
          .prepare(
            'UPDATE sky_communities SET os_revision=?,rules=?,post_mode=? WHERE id=? AND owner_id=? AND os_revision=? AND archived_at=0',
          )
          .bind(
            version,
            draft.rules,
            draft.postMode,
            id,
            owner,
            community.os_revision,
          ),
        db
          .prepare(
            'INSERT INTO sky_community_editions(community_id,version,manifest,digest,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_communities WHERE id=? AND os_revision=?) ON CONFLICT DO NOTHING',
          )
          .bind(id, version, payload, digest, now, id, version),
      ]);
      if (result[0].meta.changes !== 1)
        throw new SkySocialError(
          'OS構成が更新されました。入力を残して再読込してください。',
          409,
        );
      return { manifest, digest };
    }
    const before = await installed(id);
    if (v.action === 'deactivate') {
      if (!before || v.revision !== before.revision)
        throw new SkySocialError('追加状態が変わりました。', 409);
      const r = await db
        .prepare(
          'UPDATE sky_community_installs SET active=0,revision=revision+1,updated_at=? WHERE owner_id=? AND community_id=? AND revision=?',
        )
        .bind(Date.now(), owner, id, before.revision)
        .run();
      if (!r.meta.changes)
        throw new SkySocialError('追加状態が変わりました。', 409);
      return state();
    }
    if (v.action !== 'apply' || v.approve !== true)
      throw new SkySocialError(
        '追加するルール・デザイン・LLM・Agentを確認してください。',
      );
    const preview = await edition(id, Number(v.version));
    if (
      !preview.edition ||
      preview.edition.manifest.version !== v.version ||
      preview.edition.digest !== v.digest
    )
      throw new SkySocialError('確認したOS構成の版と内容が違います。', 409);
    if (
      before?.active &&
      before.version === v.version &&
      before.manifest === JSON.stringify(preview.edition.manifest)
    )
      return state();
    if (
      !Number.isSafeInteger(v.revision) ||
      v.revision !== (before?.revision ?? 0) ||
      typeof v.expectedActive !== 'string'
    )
      throw new SkySocialError('追加状態が更新されています。', 409);
    const manifest = preview.edition.manifest,
      templates = communityOsAgentTemplates(manifest),
      refs: Ref[] = await Promise.all(
        templates.map(async (a) => ({
          templateId: a.id,
          id: await agentId(owner, id, manifest.version, a.id),
        })),
      );
    const ids = JSON.stringify(refs.map((r) => r.id)),
      token = crypto.randomUUID(),
      now = Date.now(),
      payload = JSON.stringify(manifest);
    const guard =
      'EXISTS(SELECT 1 FROM sky_community_installs WHERE owner_id=? AND community_id=? AND save_token=?)';
    const statements = [
      db
        .prepare(
          "INSERT INTO sky_community_installs(owner_id,community_id,version,revision,manifest,agent_refs,active,save_token,updated_at) VALUES(?,?,0,0,'','[]',0,'',?) ON CONFLICT DO NOTHING",
        )
        .bind(owner, id, now),
      db
        .prepare(
          `UPDATE sky_community_installs SET version=?,revision=revision+1,manifest=?,agent_refs=?,save_token=?,updated_at=? WHERE owner_id=? AND community_id=? AND revision=? AND COALESCE((SELECT community_id FROM sky_community_installs WHERE owner_id=? AND active=1),'')=? AND (SELECT COUNT(*) FROM sky_agent_settings WHERE owner_user_id=?)+(SELECT COUNT(*) FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM sky_agent_settings a WHERE a.owner_user_id=? AND a.id=j.value))<=100`,
        )
        .bind(
          manifest.version,
          payload,
          JSON.stringify(refs),
          token,
          now,
          owner,
          id,
          v.revision,
          owner,
          v.expectedActive,
          owner,
          ids,
          owner,
        ),
      db
        .prepare(
          `UPDATE sky_community_installs SET active=0 WHERE owner_id=? AND community_id<>? AND ${guard}`,
        )
        .bind(owner, id, owner, id, token),
      db
        .prepare(
          `UPDATE sky_community_installs SET active=1 WHERE owner_id=? AND community_id=? AND save_token=?`,
        )
        .bind(owner, id, token),
    ];
    for (let n = 0; n < templates.length; n++) {
      const a = templates[n],
        ref = refs[n];
      statements.push(
        db
          .prepare(
            `INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE ${guard} ON CONFLICT(owner_user_id,id) DO NOTHING`,
          )
          .bind(
            owner,
            ref.id,
            a.sourceTool,
            JSON.stringify(a.settings),
            now,
            now,
            owner,
            id,
            token,
          ),
      );
      if (a.sourceTool)
        statements.push(
          db
            .prepare(
              `INSERT INTO sky_connections(user_id,tool,scope,consent_version,connected_at) SELECT ?,?,'execute',?,? WHERE ${guard} ON CONFLICT(user_id,tool) DO UPDATE SET scope=excluded.scope,consent_version=excluded.consent_version,connected_at=excluded.connected_at`,
            )
            .bind(
              owner,
              a.sourceTool,
              SKY_CONSENT_VERSION,
              now,
              owner,
              id,
              token,
            ),
        );
    }
    const result = await db.batch(statements);
    if (result[1].meta.changes !== 1)
      throw new SkySocialError(
        '追加状態が変わったか、Agentの保存上限です。再読み込みして確認してください。',
        409,
      );
    return state();
  }
  return { state, edition, mutate };
}
