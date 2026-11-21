// 握手・呼び出しの正本は lib/noah-mouth-mcp-remote.ts へ移した（L4）。
/**
 * Noah の口: 相手のサーバー（MCP の Streamable HTTP）との握手・道具の一覧・道具の呼び出し、
 * 相手の許可（OAuth）の発見と要求の組み立て、端末で動かす配布の起動の型紙。
 *
 * Design contract only. No credentials or production mutations.
 * 通信は、呼ぶ側が渡す ctx.fetch だけを使う。このファイル自身は接続先を持たない。
 * 既存の lib/mcp-inspection.ts（掲載の診断）と同じ URL の検査と版の一覧を使い、足すのは
 * 道具の定義の全体・定義の hash・401 の読み取り・道具の呼び出し・SSE の途中の通知の読み飛ばし。
 * 仕様の本文は docs/noah/spec-86-remote-mouth.md・spec-89-terminal-mouth.md。
 */
import { remoteMcpUrl } from '../../lib/mcp-inspection.ts';
import { NoahMouthError } from '../../lib/noah-mouth-mcp-remote.ts';
import { canonicalJson, sha256Hex, type NoahPackageTarget } from './noah-connect-v1.ts';

export { NOAH_MCP_PROTOCOLS, NOAH_MOUTH_LIMITS, NoahMouthError, isNoahPrivateAddress, createNoahGuardedFetch, parseNoahWwwAuthenticate, noahToolsSha256, noahMcpHandshake, noahMcpCall, noahMcpClose } from '../../lib/noah-mouth-mcp-remote.ts';
export type { NoahToolDef, NoahMouthContext, NoahMouthCode, NoahMcpSession, NoahHandshake } from '../../lib/noah-mouth-mcp-remote.ts';

// ---------------------------------------------------------------------------
// 相手の許可（OAuth 2.1・PKCE）。通信はしない。URL と本文を組み立てるだけ。
// ---------------------------------------------------------------------------

/** 保護された資源の公開情報を探す URL。上から順に試す。 */
export function noahProtectedResourceUrls(mcpUrl: string, hint: string | null): string[] {
  const url = new URL(mcpUrl);
  const path = url.pathname.replace(/\/+$/, '');
  return [...new Set([
    ...(hint ? [hint] : []),
    ...(path ? [`${url.origin}/.well-known/oauth-protected-resource${path}`] : []),
    `${url.origin}/.well-known/oauth-protected-resource`,
  ])];
}
/** 認可サーバーの公開情報を探す URL。上から順に試す。 */
export function noahAuthorizationServerUrls(issuer: string): string[] {
  const url = new URL(issuer);
  const path = url.pathname.replace(/\/+$/, '');
  return path
    ? [`${url.origin}/.well-known/oauth-authorization-server${path}`, `${url.origin}/.well-known/openid-configuration${path}`, `${url.origin}${path}/.well-known/openid-configuration`]
    : [`${url.origin}/.well-known/oauth-authorization-server`, `${url.origin}/.well-known/openid-configuration`];
}

export type NoahOAuthPlan =
  | {
      ok: true;
      /** cimd: Noah の client 文書の URL を client_id にする。dcr: 動的登録。両方ある時は cimd。 */
      method: 'cimd' | 'dcr';
      issuer: string;
      resource: string;
      authorizationEndpoint: string;
      tokenEndpoint: string;
      registrationEndpoint: string | null;
      scope: string | null;
    }
  | { ok: false; reason: 'no_resource_metadata' | 'no_server_metadata' | 'issuer_mismatch' | 'no_pkce' | 'no_registration' | 'not_https' };

/**
 * 公開情報から、許可の取り方を決める。実測（401 を返した 174 host）: 公開情報あり 167、
 * 動的登録 159、client 文書 62、どちらか 166、PKCE（S256）166。
 */
export function planNoahOAuth(input: {
  mcpUrl: string;
  resourceMetadata: { resource?: unknown; authorization_servers?: unknown; scopes_supported?: unknown } | null;
  serverMetadata: Record<string, unknown> | null;
  /** 401 の `WWW-Authenticate` の scope。 */
  challengedScope: string | null;
}): NoahOAuthPlan {
  const prm = input.resourceMetadata;
  const servers = Array.isArray(prm?.authorization_servers) ? prm.authorization_servers.filter((x): x is string => typeof x === 'string') : [];
  if (!prm || !servers.length) return { ok: false, reason: 'no_resource_metadata' };
  const meta = input.serverMetadata;
  if (!meta) return { ok: false, reason: 'no_server_metadata' };
  const issuer = servers[0];
  if (typeof meta.issuer !== 'string' || meta.issuer.replace(/\/+$/, '') !== issuer.replace(/\/+$/, '')) return { ok: false, reason: 'issuer_mismatch' };
  const authorizationEndpoint = meta.authorization_endpoint;
  const tokenEndpoint = meta.token_endpoint;
  const registration = typeof meta.registration_endpoint === 'string' ? meta.registration_endpoint : null;
  const https = (value: unknown): value is string => typeof value === 'string' && value.startsWith('https://');
  if (!https(authorizationEndpoint) || !https(tokenEndpoint) || (registration !== null && !https(registration))) return { ok: false, reason: 'not_https' };
  const methods = Array.isArray(meta.code_challenge_methods_supported) ? meta.code_challenge_methods_supported : [];
  if (!methods.includes('S256')) return { ok: false, reason: 'no_pkce' };
  const cimd = meta.client_id_metadata_document_supported === true;
  if (!cimd && !registration) return { ok: false, reason: 'no_registration' };
  const supported = Array.isArray(prm.scopes_supported) ? prm.scopes_supported.filter((x): x is string => typeof x === 'string') : [];
  return {
    ok: true,
    method: cimd ? 'cimd' : 'dcr',
    issuer,
    // token を使える相手を、この接続先に限る（RFC 8707）。公開情報の resource が接続先と違えば、接続先を使う。
    resource: typeof prm.resource === 'string' && input.mcpUrl.startsWith(prm.resource.replace(/\/+$/, '')) ? prm.resource : input.mcpUrl,
    authorizationEndpoint,
    tokenEndpoint,
    registrationEndpoint: registration,
    scope: input.challengedScope ?? (supported.length ? supported.join(' ') : null),
  };
}

/** Noah の client 文書。`https://<origin>/oauth/client.json` で公開する。この URL が client_id になる。 */
export function noahClientMetadata(origin: string) {
  return {
    client_id: `${origin}/oauth/client.json`,
    client_name: 'Noah',
    client_uri: `${origin}/noah`,
    redirect_uris: [`${origin}/api/noah/oauth/callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
}
/** 動的登録の本文。client 文書から client_id を除いた物。 */
export function noahRegistrationBody(origin: string) {
  const { client_id: _unused, ...body } = noahClientMetadata(origin);
  return body;
}

const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** PKCE の組。verifier は 43 文字。 */
export async function noahPkcePair(random: Uint8Array = crypto.getRandomValues(new Uint8Array(32))): Promise<{ verifier: string; challenge: string }> {
  const verifier = base64url(random);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}
/** 認可の画面の URL。state は 1 回だけ使える値で、接続の ID と本人に結ぶ。 */
export function noahAuthorizationUrl(plan: Extract<NoahOAuthPlan, { ok: true }>, input: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(plan.authorizationEndpoint);
  const set = (key: string, value: string | null) => { if (value) url.searchParams.set(key, value); };
  set('response_type', 'code');
  set('client_id', input.clientId);
  set('redirect_uri', input.redirectUri);
  set('state', input.state);
  set('code_challenge', input.challenge);
  set('code_challenge_method', 'S256');
  set('resource', plan.resource);
  set('scope', plan.scope);
  return url.toString();
}
/** token を取る要求の本文（application/x-www-form-urlencoded）。 */
export function noahTokenRequestBody(plan: Extract<NoahOAuthPlan, { ok: true }>, input: { clientId: string; redirectUri: string; code: string; verifier: string }): string {
  return new URLSearchParams({
    grant_type: 'authorization_code', code: input.code, redirect_uri: input.redirectUri,
    client_id: input.clientId, code_verifier: input.verifier, resource: plan.resource,
  }).toString();
}

// ---------------------------------------------------------------------------
// 端末で動かす配布の、起動の型紙
// ---------------------------------------------------------------------------

export type NoahLaunchPlan = {
  /** 導入の時だけ外向きに開ける host。実行の時は接続要件の egress だけ。 */
  installHosts: string[];
  /** 導入の命令。argv の並び。shell を通さない。 */
  install: string[][];
  /** 導入した物が、固定した中身と同じかの確かめ方。 */
  verify: { kind: 'npm-lock' | 'pip-hashes' | 'oci-digest' | 'file-sha256'; expect: string };
  /** 実行の argv。oci は image の名前と引数（隔離の引数は runner が付ける）。 */
  run: string[];
  env: string[];
  fixedEnv: { name: string; value: string }[];
};
const OCI_HOSTS: Record<string, string[]> = {
  'docker.io': ['registry-1.docker.io', 'auth.docker.io', 'production.cloudflare.docker.com'],
  'ghcr.io': ['ghcr.io', 'pkg-containers.githubusercontent.com'],
};
const ROOT = '/opt/agent';

/**
 * 接続要件の target（parseNoahConnect を通った物）から、導入と実行の命令を作る。
 * 固定（integrity）が無い物は動かさない。使うのは、検査を通った識別子・版・引数だけ。
 */
export function noahLaunchPlan(target: NoahPackageTarget): NoahLaunchPlan {
  if (!target.integrity) throw new NoahMouthError('blocked', '中身を固定していない配布は動かしません。');
  const common = { env: target.env, fixedEnv: target.fixedEnv ?? [] };
  if (target.registryType === 'npm') {
    return {
      ...common,
      installHosts: ['registry.npmjs.org'],
      install: [['npm', 'install', '--prefix', ROOT, '--no-audit', '--no-fund', '--no-update-notifier', `${target.identifier}@${target.version}`]],
      verify: { kind: 'npm-lock', expect: target.integrity },
      run: ['npm', 'exec', '--prefix', ROOT, '--offline', '--no', '--', target.command ?? target.identifier, ...target.args],
    };
  }
  if (target.registryType === 'pypi') {
    const spec = `${target.identifier}${target.extras?.length ? `[${target.extras.join(',')}]` : ''}==${target.version}`;
    return {
      ...common,
      installHosts: ['pypi.org', 'files.pythonhosted.org'],
      install: [
        ['uv', 'pip', 'compile', '--generate-hashes', '--output-file', `${ROOT}/requirements.txt`, '-'],   // 標準入力へ spec を 1 行
        ['uv', 'venv', `${ROOT}/venv`],
        ['uv', 'pip', 'sync', '--require-hashes', '--python', `${ROOT}/venv/bin/python`, `${ROOT}/requirements.txt`],
      ],
      verify: { kind: 'pip-hashes', expect: `${spec} ${target.integrity}` },
      run: [`${ROOT}/venv/bin/${target.command ?? target.identifier}`, ...target.args],
    };
  }
  if (target.registryType === 'oci') {
    const registry = target.identifier.split('/')[0];
    if (!OCI_HOSTS[registry]) throw new NoahMouthError('blocked', 'この registry の image は未対応です。');
    const image = `${target.identifier}@${target.integrity}`;
    return {
      ...common,
      installHosts: OCI_HOSTS[registry],
      install: [['docker', 'pull', image]],
      verify: { kind: 'oci-digest', expect: target.integrity },
      run: [image, ...target.args],
    };
  }
  return {
    ...common,
    installHosts: [new URL(target.identifier).hostname, 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'],
    install: [['noah-fetch', target.identifier, `${ROOT}/archive`], ['noah-extract', `${ROOT}/archive`, ROOT]],
    verify: { kind: 'file-sha256', expect: target.integrity },
    run: [`${ROOT}/${target.command!.replace(/^\.\//, '')}`, ...target.args],
  };
}
