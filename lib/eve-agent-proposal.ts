import { defaultSkyAgentSettings, parseSkyAgentSettings, type SkyAgentSettings } from './sky-agent-library.ts';

/** Model text is an editable role proposal, never a Tool, identity or budget grant. */
export function eveAgentDraftFromReply(text: string): SkyAgentSettings {
  if (typeof text !== 'string' || !text.trim() || text.length > 16_000)
    throw new Error('下書きに使う回答を選んでください。');
  const raw = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/.exec(raw);
  const body = fenced ? fenced[1].trim() : raw;
  if (body.startsWith('{') || fenced) {
    let value: unknown;
    try { value = JSON.parse(body); } catch { throw new Error('回答のJSONを確認してください。文章として使う場合は役割の文章へ編集してください。'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('担当案の形式を確認してください。');
    const v = value as Record<string, unknown>;
    if (Object.keys(v).length !== 5 || Object.keys(v).some(key => !['schema','name','purpose','input','output'].includes(key)) ||
        v.schema !== 'rockstaros.eve-agent-proposal/1' ||
        !['name','purpose','input','output'].every(key => typeof v[key] === 'string' && (v[key] as string).trim()))
      throw new Error('担当案は名前・役割・入力・期待する成果を確認してください。Toolや権限はSmithで別に設定します。');
    return parseSkyAgentSettings(defaultSkyAgentSettings(v.name as string,
      `目的・役割: ${(v.purpose as string).trim()}\n受け取るもの: ${(v.input as string).trim()}\n期待する成果: ${(v.output as string).trim()}`));
  }
  if (body.length > 1200) throw new Error('役割は1200文字以内です。使う部分を編集してから下書きにしてください。');
  return parseSkyAgentSettings(defaultSkyAgentSettings('回答から作った担当', body));
}
