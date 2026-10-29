import { catalog } from './catalog.ts';
import { defaultSkyAgentSettings, parseSkyAgentSettings, skyAgentId, skyAgentSystem, SkyAgentLibraryError, type SkyLibraryAgent } from './sky-agent-library.ts';

type Database = Pick<D1Database, 'prepare'>;
type Row = { id: string; sourceTool: string | null; settings: string; revision: number; updatedAt: number };
export function skyAgentLibraryStore(db: Database, owner: string) {
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
    if (before?.requirements && !Object.hasOwn(input as object, 'requirements')) settings = { ...settings, requirements: before.requirements };
    if (before?.requirements?.contract && settings.requirements && !Object.hasOwn(settings.requirements,'contract')) {
      const { contract: _contract, ...legacy } = before.requirements;
      if (JSON.stringify(settings.requirements) !== JSON.stringify(legacy))
        throw new SkyAgentLibraryError('新しい型・処理能力・permission・scope条件を確認できる画面で変更してください。',409);
      settings = { ...settings, requirements:{ ...settings.requirements, contract:before.requirements.contract } };
    }
    const now = Date.now();
    const result = revision === 0
      ? await db.prepare('INSERT INTO sky_agent_settings(owner_user_id,id,source_tool,settings,revision,created_at,updated_at) SELECT ?,?,?,?,1,?,? WHERE (SELECT COUNT(*) FROM sky_agent_settings WHERE owner_user_id=?)<100 ON CONFLICT(owner_user_id,id) DO NOTHING').bind(owner,id,before?.sourceTool ?? null,JSON.stringify(settings),now,now,owner).run()
      : await db.prepare('UPDATE sky_agent_settings SET settings=?,revision=revision+1,updated_at=? WHERE owner_user_id=? AND id=? AND revision=?').bind(JSON.stringify(settings),now,owner,id,revision).run();
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
