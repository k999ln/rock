import { skyHubKey, skyHubKind, skyHubResource, type SkyHubPlugin } from './sky-hub.ts';

/** A saved-resource snapshot, never an upstream authenticity or execution grant. */
export type EveSourcePin = { schema: 'rockstaros.eve-source/1'; key: string; revision: number; metadataSha256: string };
export function parseEveSourcePin(value: unknown): EveSourcePin {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('出典を確認してください。');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).length !== 4 || v.schema !== 'rockstaros.eve-source/1' || typeof v.key !== 'string' || v.key.length > 300 ||
      !Number.isSafeInteger(v.revision) || (v.revision as number) < 1 || typeof v.metadataSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(v.metadataSha256)) throw new Error('出典の版を確認してください。');
  const split = v.key.indexOf(':');
  const kind = skyHubKind(v.key.slice(0, split));
  if (kind === 'x' || skyHubKey(kind, skyHubResource(kind, v.key.slice(split + 1))) !== v.key) throw new Error('追加済みのモデル・データ・アプリを選んでください。');
  return { schema: v.schema, key: v.key, revision: v.revision as number, metadataSha256: v.metadataSha256 };
}
export async function eveSourcePin(plugin: SkyHubPlugin): Promise<EveSourcePin> {
  const value = plugin.metadata;
  const bytes = new TextEncoder().encode(JSON.stringify({ title:value.title, sourceUrl:value.sourceUrl, revision:value.revision,
    license:value.license, task:value.task, downloads:value.downloads, likes:value.likes, gated:value.gated, sdk:value.sdk, skyFeeMinor:value.skyFeeMinor }));
  const metadataSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
  return parseEveSourcePin({ schema:'rockstaros.eve-source/1', key:plugin.key, revision:plugin.revision, metadataSha256 });
}
export function sameEveSource(a: EveSourcePin, b: EveSourcePin) {
  return a.key === b.key && a.revision === b.revision && a.metadataSha256 === b.metadataSha256;
}
