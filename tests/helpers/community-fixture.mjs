import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { skySocialStore } from '../../lib/sky-social-store.ts';
import { communityOsStore } from '../../lib/community-os-store.ts';
import { defaultCommunityOsDesign } from '../../lib/community-os.ts';
export const secret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
export function communityFixture(t) {
  const sql = new DatabaseSync(':memory:');
  t.after(() => sql.close());
  for (const file of [
    '0026_sky_communities.sql',
    '0027_community_os_keys.sql',
    '0028_sky_timeline_interactions.sql',
    '0022_sky_agent_settings.sql',
  ])
    sql.exec(
      readFileSync(new URL(`../../drizzle/${file}`, import.meta.url), 'utf8'),
    );
  const initial = readFileSync(
    new URL('../../drizzle/0013_sky_provider_connections.sql', import.meta.url),
    'utf8',
  );
  sql.exec(initial.match(/CREATE TABLE IF NOT EXISTS `sky_connections`[\s\S]*?;/)[0]);
  sql.exec(
    'CREATE UNIQUE INDEX fixture_connection_identity ON sky_connections(user_id,tool)',
  );
  const prepare = (query, args = []) => ({
    bind(...v) {
      return prepare(query, v);
    },
    async first() {
      return sql.prepare(query).get(...args) ?? null;
    },
    async all() {
      return { results: sql.prepare(query).all(...args) };
    },
    async run() {
      return {
        meta: { changes: Number(sql.prepare(query).run(...args).changes) },
      };
    },
  });
  const db = {
    prepare,
    async batch(items) {
      sql.exec('BEGIN');
      try {
        const r = [];
        for (const item of items) r.push(await item.run());
        sql.exec('COMMIT');
        return r;
      } catch (e) {
        sql.exec('ROLLBACK');
        throw e;
      }
    },
  };
  const keys = { alice: {}, bob: {}, carol: {} },
    recoveries = {};
  const store = (owner = 'alice', override = keys[owner]) =>
      skySocialStore(db, owner, override),
    os = (owner = 'alice', override = keys[owner]) =>
      communityOsStore(db, owner, override);
  async function accounts() {
    for (const owner of Object.keys(keys))
      await store(owner).mutate({
        action: 'profile',
        name: `Fixture ${owner}`,
      });
  }
  async function create(owner = 'alice', id = crypto.randomUUID()) {
    const key = (keys[owner][id] ??= secret()),
      recoveryKey = (recoveries[id] ??= secret());
    await store(owner).mutate({
      action: 'createCommunity',
      id,
      name: '試験用工房',
      description: '合成データの場所',
      rules: '作品とアイデアを共有する',
      visibility: 'members',
      accessKey: key,
      recoveryKey,
    });
    return id;
  }
  async function join(id, owner = 'bob', invitation) {
    const invite =
      invitation ?? (await store().mutate({ action: 'invite', id })).invite;
    const preview = await store(owner).mutate({
      action: 'previewInvite',
      ...invite,
    });
    const key = (keys[owner][id] ??= secret());
    await store(owner).mutate({
      action: 'join',
      ...invite,
      confirmRules: true,
      rulesVersion: preview.community.rulesVersion,
      accessKey: key,
    });
    return key;
  }
  return { sql, db, store, os, keys, recoveries, accounts, create, join };
}
export const post = (
  content = '合成の投稿',
  communityId = null,
  extra = {},
) => ({
  action: 'post',
  id: crypto.randomUUID(),
  content,
  communityId,
  ...extra,
});
export const draft = (extra = {}) => ({
  name: '工房OS',
  rules: '互いの作品を尊重する',
  postMode: 'members',
  design: { ...defaultCommunityOsDesign },
  llm: { provider: 'ollama', model: 'qwen2.5:1.5b' },
  agents: [
    {
      id: 'maker',
      sourceTool: null,
      settings: {
        name: '制作担当',
        instructions: '作品の計画を作る',
        provider: 'ollama',
        model: 'qwen2.5:1.5b',
        enabled: true,
      },
    },
  ],
  ...extra,
});
