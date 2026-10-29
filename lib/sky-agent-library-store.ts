import type { CommunityKeys } from './community-access.ts';
import { evePostCreatePredicate } from './eve-post-source-store.ts';
import { eveSourceContext } from './eve-source-context-store.ts';
import { sameEveSource } from './eve-source-context.ts';
import { catalog } from './catalog.ts';
import { defaultSkyAgentSettings, parseSkyAgentSettings, skyAgentId, skyAgentSystem, SkyAgentLibraryError, type SkyLibraryAgent } from './sky-agent-library.ts';

type Database = Pick<D1Database, 'prepare'>;
type Row = { id: string; sourceTool: string | null; settings: string; revision: number; updatedAt: number };
export function skyAgentLibraryStore(db: Database, owner: string, keys: CommunityKeys = {}) {
  async function list(): Promise<SkyLibraryAgent[]> {
    const [saved, connected] = await Promise.all([
      db.prepare('SELECT id,source_tool AS sourceTool,settings,revision,updated_at AS updatedAt FROM sky_agent_settings WHERE owner_user_id=? ORDER BY updated_at DESC LIMIT 200').bind(owner).all<Row>(),
      db.prepare('SELECT tool,connected_at AS connectedAt FROM sky_connections WHERE user_id=? ORDER BY connected_at DESC LIMIT 200').bind(owner).all<{ tool: string; connectedAt: number }>(),
    ]);
    const records = saved.results.filter(r => !r.sourceTool || connected.results.some(c => c.tool === r.sourceTool));
    const agents = records.map(r => ({ id: r.id, sourceTool: r.sourceTool, revision: r.revision, updatedAt: r.updatedAt,
      ...parseSkyAgentSettings(JSON.parse(r.settings)), source: r.sourceTool ? 'sky-tool' as const : 'personal' as const }));
    for (const connection of connected.results) {
      const tool = catalog.find(t => t.id === connection.tool);
      if (!tool || agents.some(a => a.sourceTool === tool.id)) continue;
      agents.push({ id: `tool:${tool.id}`, sourceTool: tool.id, revision: 0, updatedAt: connection.connectedAt,
        ...defaultSkyAgentSettings(tool.name, tool.description), source: 'sky-tool' });
    }
    return agents;
  }
  async function get(id: string) { return (await list()).find(a => a.id === skyAgentId(id)) ?? null; }
  async function save(id: string, revision: number, input: unknown, create = false) {
    skyAgentId(id);
    let settings = parseSkyAgentSettings(input);
    if (!Number.isSafeInteger(revision) || revision < 0) throw new SkyAgentLibraryError('設定の版を確認してください。');
    const before = await get(id);
    if (create) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) || revision !== 0 || before) throw new SkyAgentLibraryError('新しいエージェントのIDを確認してください。', 409);
    } else if (!before) throw new SkyAgentLibraryError('エージェントが見つかりません。', 404);
    if (before && before.revision !== revision) throw new SkyAgentLibraryError('別の画面で設定が変更されました。入力を残したまま、最新の設定を確認してください。', 409);
    // Older editors submit only the original five fields. Preserve requirements
    // rather than silently erasing them; a current editor may explicitly clear them.
    // Legacy editors do not know attachment; omission cannot erase it.
    if (before?.attachment && !Object.hasOwn(input as object, 'attachment')) settings = { ...settings, attachment: before.attachment };
    if (before?.requirements && !Object.hasOwn(input as object, 'requirements')) settings = { ...settings, requirements: before.requirements };
    if (before?.requirements?.contract && settings.requirements && !Object.hasOwn(settings.requirements,'contract')) {
      const { contract: _contract, ...legacy } = before.requirements;
      if (JSON.stringify(settings.requirements) !== JSON.stringify(legacy))
        throw new SkyAgentLibraryError('新しい型・処理能力・permission・scope条件を確認できる画面で変更してください。',409);
      settings = { ...settings, requirements:{ ...settings.requirements, contract:before.requirements.contract } };
    }
    // Provenance is immutable history, not an execution or model attestation.
    // Old editors omit it; their saves must retain it even if the source is now unavailable.
    if (before?.origin) {
      if (settings.origin && JSON.stringify(settings.origin) !== JSON.stringify(before.origin))
        throw new SkyAgentLibraryError('保存済みの下書きの由来は変更できません。',409);
      settings = { ...settings, origin:before.origin };
    } else if (!create && settings.origin) {
      throw new SkyAgentLibraryError('既存の担当へ過去の由来を追加できません。',409);
    }
    let sourceRow: {key:string;revision:number;metadata:string} | null = null;
    let postPredicate: {sql:string;args:(string|number|null)[]} | null = null;
    if (create && settings.origin?.source) {
      try {
        if(settings.origin.source.schema==='rockstaros.eve-post-source/1') {
          postPredicate=await evePostCreatePredicate(db,owner,settings.origin.source,keys);
        } else {
          const context = await eveSourceContext(db,owner,settings.origin.source.key);
          if (!sameEveSource(context.source,settings.origin.source) || !('plugin' in context)) throw new Error('changed');
          sourceRow = {key:context.plugin.key,revision:context.plugin.revision,metadata:JSON.stringify(context.plugin.metadata)};
        }
      } catch { throw new SkyAgentLibraryError('出典が変わったか確認できません。Skyから選び直してください。',409,'EVE_SOURCE_CHANGED'); }
    }
    const now = Date.now();
    const result = revision === 0
      ? postPredicate ? await db.prepare(`INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM sky_agent_settings WHERE owner_user_id=?)<100 AND ${postPredicate.sql} ON CONFLICT(owner_user_id,id) DO NOTHING`).bind(owner,id,before?.sourceTool ?? null,JSON.stringify(settings),now,now,owner,...postPredicate.args).run()
        : await db.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM sky_agent_settings WHERE owner_user_id=?)<100 AND (? IS NULL OR EXISTS(SELECT 1 FROM sky_hub_plugins WHERE owner_user_id=? AND plugin_key=? AND revision=? AND metadata=? AND enabled=1)) ON CONFLICT(owner_user_id,id) DO NOTHING').bind(owner,id,before?.sourceTool ?? null,JSON.stringify(settings),now,now,owner,sourceRow?.key ?? null,owner,sourceRow?.key ?? null,sourceRow?.revision ?? null,sourceRow?.metadata ?? null).run()
      : await db.prepare('UPDATE sky_agent_settings SET settings=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=? AND revision=?').bind(JSON.stringify(settings),now,owner,id,revision).run();
    if (result.meta.changes !== 1 && create && (sourceRow || postPredicate) && !(await get(id))) {
      // A duplicate may already have committed: keep its ambiguous 409 readback.
      // A now-stale source makes this attempt and same-pin replays unable to insert.
      try {
        const current = await eveSourceContext(db,owner,settings.origin!.source!.key,keys);
        if (!sameEveSource(current.source,settings.origin!.source!)) throw new Error('changed');
      } catch { throw new SkyAgentLibraryError('出典が変わりました。Skyから選び直してください。',409,'EVE_SOURCE_CHANGED'); }
    }
    if (result.meta.changes !== 1) throw new SkyAgentLibraryError('設定が更新されています。再読込して確認してください。', 409);
    return (await get(id))!;
  }
  return { list, get, save };
}
/** Bind each inference/estimate to the current owner's saved revision; no credentials or grants are stored here. */
export async function bindSkyAgentLlmInput(db: Database, owner: string, value: Record<string, unknown>) {
  if (value.agentId === undefined && value.agentRevision === undefined) return value;
  const id = skyAgentId(value.agentId);
  const agent = await skyAgentLibraryStore(db, owner).get(id);
  if (!agent) throw new SkyAgentLibraryError('エージェントが見つかりません。', 404);
  if (!agent.enabled) throw new SkyAgentLibraryError('このエージェントはEveでの利用を停止しています。', 409);
  if (value.agentRevision !== agent.revision) throw new SkyAgentLibraryError('設定が更新されました。Skyで最新の内容を確認してから依頼してください。', 409);
  if (value.provider !== agent.provider || value.model !== agent.model) throw new SkyAgentLibraryError('保存したLLMと依頼のLLMが一致しません。', 409);
  return { ...value, provider: agent.provider, model: agent.model, system: skyAgentSystem(agent), baseUrl: undefined };
}
