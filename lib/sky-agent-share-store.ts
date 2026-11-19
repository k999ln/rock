import { skyAgentLibraryStore } from './sky-agent-library-store.ts';
import { parseSkyAgentSettings, skyAgentId } from './sky-agent-library.ts';
import { communityKeyHash, requireCommunityKey, type CommunityKeys } from './community-access.ts';
import { parseAgentShare, shareDigest, shareVersion } from './sky-agent-share.ts';
import { socialId, socialObject, socialText, SkySocialError } from './sky-social.ts';

type DB = Pick<D1Database, 'prepare' | 'batch'>;
type Row = { id: string; version: number; owner_id: string; community_id: string | null; manifest: string; digest: string; withdrawn_at: number };
type Install = { agent_id: string; manifest: string; digest: string; config_digest: string };
async function uuid(value: unknown[]) {
  const h = await communityKeyHash(JSON.stringify(value));
  return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function skyAgentShareStore(db: DB, owner: string, keys: CommunityKeys = {}) {
  async function profile() {
    const p = await db.prepare('SELECT id,name FROM sky_social_profiles WHERE owner_id=?').bind(owner).first<{id:string;name:string}>();
    if (!p) throw new SkySocialError('ホームで公開プロフィールを作成してください。', 409);
    return p;
  }
  async function access(community: string | null) {
    if (community) await requireCommunityKey(db, owner, community, keys);
  }
  // Re-evaluate membership/key revocation in the same SQL transaction as each write.
  async function acl(community: string | null) {
    if (!community) return { sql: '1', args: [] as string[] };
    await access(community);
    return {
      sql: 'EXISTS(SELECT 1 FROM sky_community_keys k JOIN sky_social_profiles p ON p.id=k.profile_id JOIN sky_community_members m ON m.community_id=k.community_id AND m.profile_id=k.profile_id JOIN sky_communities c ON c.id=k.community_id WHERE k.community_id=? AND p.owner_id=? AND k.key_hash=? AND k.revoked_at=0 AND c.archived_at=0)',
      args: [community, owner, await communityKeyHash(keys[community])],
    };
  }
  async function read(id: string, version: number) {
    const row = await db.prepare('SELECT * FROM sky_agent_shares WHERE id=? AND version=?').bind(socialId(id), shareVersion(version)).first<Row>();
    if (!row) throw new SkySocialError('共有担当が見つかりません。', 404);
    await access(row.community_id);
    if (row.withdrawn_at && row.owner_id !== owner) throw new SkySocialError('この版は公開を停止しています。', 410);
    const manifest = parseAgentShare(JSON.parse(row.manifest));
    if (await communityKeyHash(JSON.stringify(manifest)) !== row.digest) throw new SkySocialError('共有内容の整合性を確認できません。', 503);
    const author = await db.prepare('SELECT id,name FROM sky_social_profiles WHERE id=?').bind(manifest.author).first<{id:string;name:string}>();
    return { manifest, digest: row.digest, author, mine: row.owner_id === owner, withdrawn: Boolean(row.withdrawn_at) };
  }
  async function preview(agentId: string, description: string, communityId: string | null) {
    const agent = await skyAgentLibraryStore(db, owner).get(skyAgentId(agentId));
    if (!agent || agent.sourceTool) throw new SkySocialError('保存済みの自分用担当を選んでください。', 404);
    const p = await profile(); await access(communityId);
    const id = await uuid(['agent-share/1', owner, agent.id, communityId]);
    const latest = await db.prepare('SELECT MAX(version) AS version FROM sky_agent_shares WHERE id=?').bind(id).first<{version:number|null}>();
    const expectedVersion = latest?.version ?? 0;
    const installed = await db.prepare('SELECT agent_id,manifest,digest,config_digest FROM sky_agent_share_installs WHERE owner_id=? AND agent_id=?').bind(owner,agent.id).first<Install>();
    const parentManifest = installed ? parseAgentShare(JSON.parse(installed.manifest)) : null;
    if (parentManifest && installed && await communityKeyHash(JSON.stringify(parentManifest)) !== installed.digest)
      throw new SkySocialError('追加元の共有内容を確認できません。',503);
    if (parentManifest?.communityId && parentManifest.communityId !== communityId)
      throw new SkySocialError('コミュニティー限定の担当は同じ場所の中で共有してください。', 403);
    const manifest = parseAgentShare({ schema: 'rockstar-agent-share/1', id, version: expectedVersion + 1, author: p.id, communityId, license: communityId ? 'community-copy/1' : 'CC-BY-4.0', description,
      agent: { name: agent.name, instructions: agent.instructions, provider: agent.provider, model: agent.model },
      parent: parentManifest && installed ? { id: parentManifest.id, version: parentManifest.version, digest: installed.digest, author: parentManifest.author, license: parentManifest.license } : null });
    return { manifest, digest: await communityKeyHash(JSON.stringify(manifest)), expectedVersion, agentRevision: agent.revision };
  }
  async function versions(agentId: string, communityId: string | null) {
    skyAgentId(agentId); await access(communityId);
    const id = await uuid(['agent-share/1',owner,agentId,communityId]);
    const rows = await db.prepare('SELECT version,digest,withdrawn_at AS withdrawnAt FROM sky_agent_shares WHERE id=? AND owner_id=? ORDER BY version DESC LIMIT 100').bind(id,owner).all<{version:number;digest:string;withdrawnAt:number}>();
    return { id, versions: rows.results };
  }
  async function mutate(raw: unknown) {
    const v = socialObject(raw, ['action','agentId','agentRevision','description','communityId','expectedVersion','digest','approve','license','id','version','provider','model']);
    if (v.action === 'versions') {
      socialObject(raw,['action','agentId','communityId']);
      return versions(skyAgentId(v.agentId),v.communityId === null ? null : socialId(v.communityId));
    }
    if (v.action === 'preview') {
      socialObject(raw,['action','agentId','description','communityId']);
      return preview(skyAgentId(v.agentId),socialText(v.description,300),v.communityId === null ? null : socialId(v.communityId));
    }
    if (v.action === 'publish') {
      socialObject(raw,['action','agentId','agentRevision','description','communityId','expectedVersion','digest','approve','license']);
      if (v.approve !== true) throw new SkySocialError('共有内容・権利・利用条件を確認してください。');
      const agentId = skyAgentId(v.agentId), communityId = v.communityId === null ? null : socialId(v.communityId);
      const draft = await preview(agentId, socialText(v.description,300), communityId);
      if (v.license !== draft.manifest.license) throw new SkySocialError('共有先の利用条件を確認してください。');
      if (draft.digest !== shareDigest(v.digest) || v.agentRevision !== draft.agentRevision || v.expectedVersion !== draft.expectedVersion)
        throw new SkySocialError('担当や共有版が更新されました。公開前にもう一度確認してください。', 409);
      const gate = await acl(communityId), payload = JSON.stringify(draft.manifest);
      const result = await db.prepare(`INSERT INTO sky_agent_shares(id,version,owner_id,community_id,manifest,digest,created_at,withdrawn_at) SELECT ?,?,?,?,?,?,?,0 WHERE COALESCE((SELECT MAX(version) FROM sky_agent_shares WHERE id=?),0)=? AND (SELECT COUNT(*) FROM sky_agent_shares WHERE owner_id=?)<1000 AND EXISTS(SELECT 1 FROM sky_agent_settings WHERE owner_user_id=? AND id=? AND revision=? AND source_tool IS NULL) AND ${gate.sql} ON CONFLICT DO NOTHING`)
        .bind(draft.manifest.id,draft.manifest.version,owner,communityId,payload,draft.digest,Date.now(),draft.manifest.id,draft.expectedVersion,owner,owner,agentId,draft.agentRevision,...gate.args).run();
      if (result.meta.changes !== 1) throw new SkySocialError('担当/共有版/参加状態が変わったか、共有の上限に達しました。',409);
      return { published: true, ...draft };
    }
    if (v.action === 'withdraw') {
      socialObject(raw,['action','id','version','digest','approve']);
      const id = socialId(v.id), version = shareVersion(v.version), view = await read(id,version);
      if (!view.mine || view.digest !== shareDigest(v.digest) || v.approve !== true) throw new SkySocialError('作成者が公開停止する版を確認してください。',403);
      const gate = await acl(view.manifest.communityId);
      const r = await db.prepare(`UPDATE sky_agent_shares SET withdrawn_at=? WHERE id=? AND version=? AND owner_id=? AND digest=? AND withdrawn_at=0 AND ${gate.sql}`).bind(Date.now(),id,version,owner,view.digest,...gate.args).run();
      if (!r.meta.changes && !view.withdrawn) throw new SkySocialError('参加状態または共有版が変わりました。',409);
      return { withdrawn: true };
    }
    if (v.action !== 'add' || v.approve !== true) throw new SkySocialError('追加する内容と利用条件を確認してください。');
    socialObject(raw,['action','id','version','digest','approve','provider','model']);
    const id = socialId(v.id), version = shareVersion(v.version), view = await read(id,version);
    if (view.withdrawn || view.digest !== shareDigest(v.digest)) throw new SkySocialError('共有版が変わったか、公開を停止しています。',409);
    const settings = parseSkyAgentSettings({ ...view.manifest.agent, provider: v.provider, model: v.model, enabled: false });
    const configDigest = await communityKeyHash(JSON.stringify(settings));
    const previous = () => db.prepare('SELECT agent_id,manifest,digest,config_digest FROM sky_agent_share_installs WHERE owner_id=? AND share_id=? AND version=?').bind(owner,id,version).first<Install>();
    const before = await previous();
    let created = false;
    if (!before) {
      const gate = await acl(view.manifest.communityId), agentId = await uuid(['agent-share-install/1',owner,id,version]), token = crypto.randomUUID(), now = Date.now();
      const result = await db.batch([
        db.prepare(`INSERT INTO sky_agent_share_installs(owner_id,share_id,version,agent_id,manifest,digest,config_digest,save_token,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM sky_agent_shares WHERE id=? AND version=? AND digest=? AND withdrawn_at=0) AND (SELECT COUNT(*) FROM sky_agent_settings WHERE owner_user_id=?)<100 AND NOT EXISTS(SELECT 1 FROM sky_agent_settings WHERE owner_user_id=? AND id=?) AND ${gate.sql} ON CONFLICT DO NOTHING`)
          .bind(owner,id,version,agentId,JSON.stringify(view.manifest),view.digest,configDigest,token,now,id,version,view.digest,owner,owner,agentId,...gate.args),
        db.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) SELECT ?,?,NULL,?,1,?,? WHERE EXISTS(SELECT 1 FROM sky_agent_share_installs WHERE owner_id=? AND share_id=? AND version=? AND save_token=?)')
          .bind(owner,agentId,JSON.stringify(settings),now,now,owner,id,version,token),
      ]);
      created = result[0].meta.changes === 1;
    }
    const saved = await previous();
    if (!saved || saved.digest !== view.digest || saved.config_digest !== configDigest) throw new SkySocialError('追加状態/モデルが変わったか、保存上限に達しました。設定画面で確認してください。',409);
    const agent = await skyAgentLibraryStore(db,owner).get(saved.agent_id);
    if (!agent) throw new SkySocialError('追加した担当を確認できません。',409);
    return { agent, replayed: !created, source: { id, version, digest: view.digest, author: view.manifest.author } };
  }
  return { read, preview, versions, mutate };
}
