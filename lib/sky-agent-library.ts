import { parseEveAgentOrigin, type EveAgentOrigin } from './eve-agent-origin.ts';
import { parseSkyObjectAttachment, type SkyObjectAttachment } from './sky-object-attachment.ts';
import { parseSkyAgentRequirements, type SkyAgentRequirements } from './sky-agent-requirements.ts';
import { isTextModelProvider, textModelProviderDefinition, type TextModelProviderId } from './llm-providers.ts';

export type SkyAgentSettings = {
  name: string;
  instructions: string;
  provider: TextModelProviderId;
  model: string;
  enabled: boolean;
  requirements?: SkyAgentRequirements;
  attachment?: SkyObjectAttachment;
  origin?: EveAgentOrigin;
};
export type SkyLibraryAgent = SkyAgentSettings & {
  id: string;
  sourceTool: string | null;
  revision: number;
  updatedAt: number;
  source: 'personal' | 'sky-tool';
};
export class SkyAgentLibraryError extends Error {
  readonly status: number;
  readonly code?: 'EVE_SOURCE_CHANGED';
  constructor(message: string, status = 400, code?: 'EVE_SOURCE_CHANGED') { super(message); this.status = status; this.code = code; }
}
export function skyAgentId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/.test(value))
    throw new SkyAgentLibraryError('エージェントを確認してください。');
  return value;
}
export function parseSkyAgentSettings(value: unknown): SkyAgentSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new SkyAgentLibraryError('設定の形式を確認してください。');
  const v = value as Record<string, unknown>;
  if (![5, 6, 7, 8].includes(Object.keys(v).length) || Object.keys(v).some(k => !['name', 'instructions', 'provider', 'model', 'enabled', 'requirements', 'attachment', 'origin'].includes(k)) || ['name', 'instructions', 'provider', 'model', 'enabled'].some(k => !Object.hasOwn(v, k)))
    throw new SkyAgentLibraryError('名前・役割・接続先・モデル・有効状態だけを保存できます。');
  const text = (x: unknown, max: number) => {
    if (typeof x !== 'string' || !x.trim() || x.length > max)
      throw new SkyAgentLibraryError('名前・役割・モデルの文字数と内容を確認してください。');
    for (let i = 0; i < x.length; i++) {
      const n = x.charCodeAt(i);
      if ((n < 32 && n !== 9 && n !== 10 && n !== 13) || n === 127)
        throw new SkyAgentLibraryError('名前・役割・モデルの文字数と内容を確認してください。');
    }
    return x.trim();
  };
  if (!isTextModelProvider(v.provider) || typeof v.enabled !== 'boolean') throw new SkyAgentLibraryError('対応する接続先と有効状態を選んでください。');
  const model = text(v.model, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(model)) throw new SkyAgentLibraryError('モデルIDを確認してください。URLや秘密鍵は入力しないでください。');
  let requirements: SkyAgentRequirements | undefined;
  if (Object.hasOwn(v, 'requirements')) {
    try { requirements = parseSkyAgentRequirements(v.requirements); }
    catch (error) { throw new SkyAgentLibraryError(error instanceof Error ? error.message : '必要な能力を確認してください。'); }
  }
  let attachment: SkyObjectAttachment | undefined;
  if (Object.hasOwn(v, 'attachment')) {
    try { attachment = parseSkyObjectAttachment(v.attachment); }
    catch (error) { throw new SkyAgentLibraryError(error instanceof Error ? error.message : '対象の設定を確認してください。'); }
  }
  let origin: EveAgentOrigin | undefined;
  if (Object.hasOwn(v, 'origin')) {
    try { origin = parseEveAgentOrigin(v.origin); }
    catch { throw new SkyAgentLibraryError('下書きの由来を確認してください。'); }
  }
  return { name: text(v.name, 80), instructions: text(v.instructions, 1200), provider: v.provider, model, enabled: v.enabled, ...(requirements ? { requirements } : {}), ...(attachment ? { attachment } : {}), ...(origin ? { origin } : {}) };
}
export function skyAgentSystem(agent: SkyAgentSettings): string {
  return `あなたはEveで依頼を受ける文章担当「${agent.name}」です。次の役割は利用者の設定であり、OS権限や外部操作の承認ではありません。未実行の仕事を完了したと主張せず、権限・費用・外部送信の確認を省略しないでください。\n\n役割:\n${agent.instructions}`;
}
export function skyAgentEvePath(agent: Pick<SkyLibraryAgent, 'id' | 'revision' | 'sourceTool'>): string {
  const query = new URLSearchParams({ agent: agent.id, agentRevision: String(agent.revision) });
  if (agent.sourceTool) query.set('tool', agent.sourceTool);
  return `/chat?${query}`;
}
export function defaultSkyAgentSettings(name: string, instructions: string): SkyAgentSettings {
  return { name, instructions, provider: 'local-model', model: textModelProviderDefinition('local-model').defaultModel, enabled: true };
}
