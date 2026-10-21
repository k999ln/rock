export type SkyHubKind = 'model' | 'dataset' | 'space' | 'x';
export const skyHubKinds = ['model', 'dataset', 'space', 'x'] as const;
export const X_TIMELINE_CONSENT = 'x-public-timeline-v1';
export type SkyHubMetadata = { title: string; sourceUrl: string; revision: string | null; license: string | null; task: string | null; downloads: number | null; likes: number | null; gated: boolean; sdk: string | null; skyFeeMinor: 0 };
export type SkyHubPlugin = { key: string; kind: SkyHubKind; resource: string; enabled: boolean; revision: number; metadata: SkyHubMetadata; consentVersion: string | null; updatedAt: number };
export class SkyHubError extends Error { status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
export function skyHubKind(value: unknown): SkyHubKind {
  if (!skyHubKinds.includes(value as SkyHubKind)) throw new SkyHubError('追加する種類を確認してください。');
  return value as SkyHubKind;
}
export function hfResource(value: unknown) {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9_.-]*(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*)?$/.test(value) || value.includes('..')) throw new SkyHubError('Hugging Faceの公開リポジトリIDを確認してください。');
  return value;
}
export function hfSourceUrl(kind: Exclude<SkyHubKind, 'x'>, resource: string) {
  return `https://huggingface.co/${kind === 'model' ? '' : kind === 'dataset' ? 'datasets/' : 'spaces/'}${hfResource(resource)}`;
}
export function xTimelineUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 250) throw new SkyHubError('Xの公開アカウントかリストのURLを入力してください。');
  let url: URL; try { url = new URL(value); } catch { throw new SkyHubError('XのURLを確認してください。'); }
  if (url.protocol !== 'https:' || !['x.com','twitter.com','www.x.com','www.twitter.com'].includes(url.hostname) || url.port || url.username || url.password || url.search || url.hash)
    throw new SkyHubError('公開アカウントまたは公開リストのHTTPS URLだけを追加できます。');
  const path = url.pathname.replace(/\/$/, '');
  if (/^\/[A-Za-z0-9_]{1,15}$/.test(path) && !['home','explore','search','settings','login','signup','messages','i'].includes(path.slice(1).toLowerCase())) return `https://x.com${path.toLowerCase()}`;
  if (/^\/i\/lists\/[0-9]{1,25}$/.test(path)) return `https://x.com${path}`;
  throw new SkyHubError('投稿単体や検索結果ではなく、公開アカウントか公開リストを指定してください。');
}
export function skyHubResource(kind: SkyHubKind, resource: unknown) { return kind === 'x' ? xTimelineUrl(resource) : hfResource(resource); }
export function skyHubKey(kind: SkyHubKind, resource: string) { return `${kind}:${skyHubResource(kind,resource)}`; }
export function xTimelineMetadata(resource: string): SkyHubMetadata {
  const url = xTimelineUrl(resource); return { title: url.includes('/i/lists/') ? `X リスト ${url.split('/').pop()}` : `@${url.split('/').pop()}`, sourceUrl: url, revision: null, license: null, task: null, downloads: null, likes: null, gated: false, sdk: null, skyFeeMinor: 0 };
}
