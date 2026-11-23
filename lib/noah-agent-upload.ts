import { isNoahCover, type NoahCover } from './noah-cover.ts';
import { parseNoahRuntime } from './noah-runtime-contract.mjs';
export const NOAH_SOURCE_LIMIT = 10 * 1024 * 1024;
export const NOAH_CODE_LIMIT = 64 * 1024;
export const NOAH_MANIFEST_LIMIT = 32 * 1024;
export const NOAH_ADAPTERS = ['web', 'mcp_http', 'a2a', 'local_app', 'source'] as const;
export const NOAH_PERMISSIONS = ['read_input', 'write_files', 'network', 'external_account', 'external_write', 'financial'] as const;
export type NoahAgentManifest = {
  schema: 'noah-agent/1'; id: string; version: string; name: string; summary: string;
  author: string; license: string; sourceUrl: string | null;
  adapter: (typeof NOAH_ADAPTERS)[number]; endpointUrl: string | null;
  permissions: (typeof NOAH_PERMISSIONS)[number][]; priceNote: string;
  runtime?: ReturnType<typeof parseNoahRuntime>;
  cover?: NoahCover;
};
export class NoahAgentError extends Error {
  status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}
function text(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || Array.from(value).some(c => { const n = c.charCodeAt(0); return n < 32 && n !== 9 && n !== 10 || n === 127; }))
    throw new NoahAgentError(`${label}を1〜${max}文字で入力してください。`);
  return value.trim();
}
export function noahPublicUrl(value: unknown) {
  try {
    const url = new URL(text(value, 'URL', 500));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
      !host.includes('.') || host.includes(':') || host.includes('[') || host.includes(']') || /^[\d.]+$/.test(host) ||
      ['localhost', 'local', 'internal', 'lan', 'test', 'invalid', 'onion'].some(s => host === s || host.endsWith(`.${s}`))) throw new Error();
    return url.href;
  } catch { throw new NoahAgentError('認証情報・クエリを含まない公開HTTPS URLを入力してください。'); }
}
export function noahUploadId(value: unknown) {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value))
    throw new NoahAgentError('登録IDを確認してください。');
  return value.toLowerCase();
}
export function parseNoahAgentManifest(value: unknown): NoahAgentManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new NoahAgentError('Agent定義のJSONを確認してください。');
  const v = value as Record<string, unknown>;
  const keys = ['schema', 'id', 'version', 'name', 'summary', 'author', 'license', 'sourceUrl', 'adapter', 'endpointUrl', 'permissions', 'priceNote'];
  if (Object.keys(v).some(k => !keys.includes(k) && k !== 'runtime' && k !== 'cover') || keys.some(k => !(k in v)) || v.schema !== 'noah-agent/1')
    throw new NoahAgentError('noah-agent/1のテンプレートを使ってください。');
  if ('cover' in v && !isNoahCover(v.cover)) throw new NoahAgentError('カバーの固定版を確認してください。');
  const id = text(v.id, '識別名', 80), version = text(v.version, '版', 40);
  if (!/^[a-z][a-z0-9-]{1,79}$/.test(id) || !/^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[a-zA-Z0-9.-]{1,16})?$/.test(version))
    throw new NoahAgentError('識別名は半角英数字とハイフン、版は1.0.0の形式にしてください。');
  if (!NOAH_ADAPTERS.includes(v.adapter as NoahAgentManifest['adapter'])) throw new NoahAgentError('接続方式を選んでください。');
  const adapter = v.adapter as NoahAgentManifest['adapter'];
  if (adapter === 'local_app' && (id !== 'anicca' || v.endpointUrl !== null))
    throw new NoahAgentError('ローカル起動は対応済みアプリのみ利用できます。');
  if (adapter === 'source' && v.endpointUrl !== null) throw new NoahAgentError('ソース登録には接続先を指定しないでください。');
  const endpointUrl = adapter === 'local_app' || adapter === 'source' ? null : noahPublicUrl(v.endpointUrl);
  if (adapter === 'a2a' && endpointUrl !== new URL(endpointUrl!).origin + '/')
    throw new NoahAgentError('A2Aにはパスを含まないHTTPS originを指定してください。');
  if (!Array.isArray(v.permissions) || v.permissions.length > NOAH_PERMISSIONS.length ||
    v.permissions.some(p => !NOAH_PERMISSIONS.includes(p)) || new Set(v.permissions).size !== v.permissions.length)
    throw new NoahAgentError('必要な権限を確認してください。');
  let runtime: NoahAgentManifest['runtime'];
  if ('runtime' in v) {
    if (adapter !== 'source' || v.permissions.some(p => !['read_input', 'write_files'].includes(p))) throw new NoahAgentError('コードテンプレートは隔離したソース実行です。外部通信・アカウント・資金操作の権限は付与できません。');
    try { runtime = parseNoahRuntime(v.runtime); } catch (e) { throw new NoahAgentError((e as Error).message); }
  }
  return { schema: 'noah-agent/1', id, version, name: text(v.name, '名前', 100), summary: text(v.summary, 'できる仕事', 2000),
    author: text(v.author, '作者', 100), license: text(v.license, 'ライセンス', 100),
    sourceUrl: v.sourceUrl === null ? null : noahPublicUrl(v.sourceUrl), adapter, endpointUrl,
    permissions: v.permissions as NoahAgentManifest['permissions'], priceNote: text(v.priceNote, '料金・利用条件', 500), ...(runtime ? { runtime } : {}), ...(isNoahCover(v.cover) ? { cover: v.cover } : {}) };
}
export async function noahSha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export const noahAgentTemplate: NoahAgentManifest = {
  schema: 'noah-agent/1', id: 'my-agent', version: '1.0.0', name: '自分のAgent', summary: 'このAgentができる仕事を書いてください。',
  author: '作者名', license: 'Private', sourceUrl: null, adapter: 'web', endpointUrl: 'https://example.com/',
  permissions: ['read_input', 'network'], priceNote: '料金・外部サービスの利用条件を書いてください。',
};
export const aniccaAgent: NoahAgentManifest = {
  schema: 'noah-agent/1', id: 'anicca', version: '0.0.0-28e7f3f', name: 'Anicca',
  summary: '本人のCodexを使い、文章や作業計画を背景で作成します。成果と実行記録をNoahで確認でき、本人の画面は操作しません。外部サイト操作・営業・常時運用は未対応です。',
  author: 'Daisuke134', license: 'MIT', sourceUrl: 'https://github.com/Daisuke134/anicca', adapter: 'local_app', endpointUrl: null,
  permissions: ['network', 'external_account', 'write_files'], priceNote: 'ソースはMIT。モデル・業務サービスの契約や料金は別途確認してください。',
};
