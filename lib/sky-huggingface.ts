import { hfResource, hfSourceUrl, SkyHubError, type SkyHubKind, type SkyHubMetadata } from './sky-hub.ts';
type Kind = Exclude<SkyHubKind, 'x'>;
type FetchLike = typeof fetch;
export type HfEntry = { kind: Kind; resource: string; metadata: SkyHubMetadata };
const plural = { model: 'models', dataset: 'datasets', space: 'spaces' } as const;
async function publicJson(url: URL, fetcher: FetchLike) {
  let response: Response;
  // A Worker has no browser cookie jar; send only this public Accept header.
  // Manual redirects work on the edge; all non-2xx responses are refused below.
  try { response = await fetcher(url, { headers: { Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12_000) }); }
  catch { throw new SkyHubError('Hugging Faceに接続できませんでした。時間を置いて再試行してください。', 503); }
  if (!response.ok) throw new SkyHubError(response.status === 429 ? '配布元のアクセス上限です。時間を置いて再試行してください。' : '公開カタログを取得できません。配布元の状態を確認してください。', response.status === 404 ? 404 : 503);
  const reader = response.body?.getReader(); if (!reader) throw new SkyHubError('配布元の応答を確認できません。', 503);
  let size = 0, text = ''; const decoder = new TextDecoder();
  while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 1_000_000) { await reader.cancel(); throw new SkyHubError('配布元の応答が大きすぎます。検索条件を絞ってください。', 503); } text += decoder.decode(chunk.value, { stream: true }); }
  try { return JSON.parse(text + decoder.decode()) as unknown; } catch { throw new SkyHubError('配布元の応答形式を確認できません。', 503); }
}
function entry(kind: Kind, value: unknown): HfEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>; let resource: string;
  try { resource = hfResource(v.id ?? v.modelId); } catch { return null; }
  if (v.private === true) return null;
  const tags = Array.isArray(v.tags) ? v.tags.filter((t): t is string => typeof t === 'string') : [];
  const card = v.cardData && typeof v.cardData === 'object' ? v.cardData as Record<string, unknown> : {};
  const license = typeof card.license === 'string' ? card.license.slice(0,120) : tags.find(t=>t.startsWith('license:'))?.slice(8,128) ?? null;
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null;
  return { kind, resource, metadata: { title: resource, sourceUrl: hfSourceUrl(kind,resource), revision: typeof v.sha === 'string' && /^[a-f0-9]{40}$/.test(v.sha) ? v.sha : null, license, task: typeof v.pipeline_tag === 'string' ? v.pipeline_tag.slice(0,100) : null, downloads: count(v.downloads), likes: count(v.likes), gated: v.gated === true || typeof v.gated === 'string' && v.gated !== 'false', sdk: typeof v.sdk === 'string' ? v.sdk.slice(0,40) : null, skyFeeMinor: 0 } };
}
export async function searchHuggingFace(kind: Kind, query: string, fetcher: FetchLike = fetch): Promise<HfEntry[]> {
  if (!Object.hasOwn(plural,kind) || typeof query !== 'string' || query.length > 80) throw new SkyHubError('検索条件を確認してください。');
  const url = new URL(`https://huggingface.co/api/${plural[kind]}`); url.searchParams.set('limit','12'); url.searchParams.set('sort','likes'); url.searchParams.set('direction','-1');
  if (query.trim()) url.searchParams.set('search',query.trim());
  const result = await publicJson(url,fetcher); if (!Array.isArray(result)) throw new SkyHubError('公開カタログの形式を確認できません。',503);
  return result.slice(0,12).map(v=>entry(kind,v)).filter((v): v is HfEntry=>v!==null);
}
export async function huggingFaceMetadata(kind: Kind, resource: string, fetcher: FetchLike = fetch) {
  hfResource(resource); const path = resource.split('/').map(encodeURIComponent).join('/');
  const value = entry(kind,await publicJson(new URL(`https://huggingface.co/api/${plural[kind]}/${path}`),fetcher));
  if (!value || value.resource !== resource) throw new SkyHubError('配布元と追加するリポジトリが一致しません。',503);
  if (!value.metadata.revision) throw new SkyHubError('配布元の版を確認できません。追加は保留しました。',503);
  return value.metadata;
}
