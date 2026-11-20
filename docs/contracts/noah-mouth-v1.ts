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
import { MCP_PROTOCOLS, McpInspectionError, remoteMcpUrl } from '../../lib/mcp-inspection.ts';
import { canonicalJson, sha256Hex, type NoahPackageTarget } from './noah-connect-v1.ts';

/** 口が受け入れる版。先頭を最初に名乗る。2024-11-05 は実測で 1.5% が返す（道具の形は同じ。読み取りだけの宣言は無い）。 */
export const NOAH_MCP_PROTOCOLS: readonly string[] = [...MCP_PROTOCOLS, '2024-11-05'];
export const NOAH_MOUTH_LIMITS = {
  /** 握手と道具の一覧の待ち（ミリ秒）。実測の 9 割は 1.2 秒以内。 */
  handshakeMs: 10_000,
  /** 道具の呼び出しの待ち。 */
  callMs: 60_000,
  /** 1 応答の上限。実測の最大は 606KB。 */
  maxBytes: 1_048_576,
  /** 道具の数の上限。実測の 2.3% が 100 個を越える。 */
  maxTools: 500,
  toolPages: 10,
  redirects: 3,
};
const CLIENT_INFO = { name: 'noah', version: '1' };
/** MCP の決まりは英数字・`_`・`-`・`.`。実在する `/` と `:` も通す。 */
const TOOL_NAME = /^[A-Za-z0-9_.:/-]{1,128}$/;
const SESSION_ID = /^[\x21-\x7e]{1,512}$/;

export type NoahToolDef = { name: string; description: string; inputSchema: unknown; readOnly: boolean };
export type NoahMouthContext = {
  /** 検査済みの fetch。createNoahGuardedFetch を通した物を渡す。 */
  fetch: typeof fetch;
  /** 中継が付ける header（Authorization や、本人が入れた鍵）。口の外へ出さない。 */
  headers?: () => Promise<Record<string, string>>;
  signal?: AbortSignal;
  maxBytes?: number;
};
export type NoahMouthCode =
  | 'auth_required'      // 401。相手の許可が要る
  | 'payment_required'   // 402。呼ぶたびの支払いが要る（未対応）
  | 'forbidden'          // 403
  | 'rate_limited'       // 429。detail.retryAfterSeconds
  | 'unreachable'        // 名前が引けない、つながらない、時間切れ、404、410、5xx
  | 'incompatible'       // 応答が読めない、版が合わない、相手がエラーを返した
  | 'too_large'          // 応答が上限を越えた
  | 'blocked';           // 接続先が検査を通らない
export class NoahMouthError extends Error {
  code: NoahMouthCode;
  detail: Record<string, unknown>;
  constructor(code: NoahMouthCode, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// 接続先の検査
// ---------------------------------------------------------------------------

/** 名前を引いた後のアドレスが、内部向けか。Node の巡回と端末の runner が、接続の前に使う。 */
export function isNoahPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (!ip.includes(':')) return true;   // アドレスの形でない物は通さない
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || ip.startsWith('ff') || ip.startsWith('64:ff9b:') || ip.startsWith('2001:db8:');
}

/**
 * 接続先を検査してから通す fetch を作る。HTTPS の公開の名前だけ。転送は自分で追い、毎回検査する。
 * check は、名前を引いた先のアドレスを確かめる差し込み口（Node では dns.lookup と isNoahPrivateAddress）。
 * sameHost が真の時は、別の host への転送に従わない（本人に見せた送り先の外へ、入力を送らない。
 * 接続要件の egress が、その接続先の host 1 つだけである事と対になる）。ローンチの握手・接続・依頼は、真で使う。
 */
export function createNoahGuardedFetch(
  base: typeof fetch,
  options: { check?: (url: URL) => Promise<void>; redirects?: number; sameHost?: boolean } = {},
): typeof fetch {
  const inspect = async (raw: string) => {
    let url: URL;
    try {
      url = remoteMcpUrl(raw);
    } catch (error) {
      if (error instanceof McpInspectionError) throw new NoahMouthError('blocked', 'この接続先にはつなげません。');
      throw error;
    }
    await options.check?.(url);
    return url;
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = await inspect(input instanceof Request ? input.url : input.toString());
    for (let hop = 0; ; hop++) {
      const response = await base(url, { ...init, redirect: 'manual' });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location) return response;
      await response.body?.cancel();
      if (hop >= (options.redirects ?? NOAH_MOUTH_LIMITS.redirects)) throw new NoahMouthError('blocked', '転送が多すぎます。');
      const next = await inspect(new URL(location, url).toString());
      if (options.sameHost && next.host !== url.host) throw new NoahMouthError('blocked', '別の接続先への転送には従いません。', { redirectedTo: next.host });
      // 別の host への転送で、本人の許可や鍵を持ち出さない。
      if (next.host !== url.host && init?.headers) init = { ...init, headers: stripCredentials(init.headers) };
      url = next;
    }
  }) as typeof fetch;
}
function stripCredentials(headers: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    if (['content-type', 'accept', 'mcp-protocol-version', 'user-agent'].includes(key)) out[key] = value;
  });
  return out;
}

// ---------------------------------------------------------------------------
// 握手・道具の一覧・道具の呼び出し
// ---------------------------------------------------------------------------

export type NoahMcpSession = { url: string; protocol: string; sessionId: string | null; nextId: number };
export type NoahHandshake = {
  session: NoahMcpSession;
  protocol: string;
  serverName: string;
  tools: NoahToolDef[];
  toolsSha256: string;
  /** 全部の道具が、読み取りだけと宣言されている。 */
  allReadOnly: boolean;
  /** 名前の形が違って入れなかった道具の数。 */
  skippedTools: number;
};

/** `WWW-Authenticate` から、保護された資源の公開情報の場所と scope を読む。 */
export function parseNoahWwwAuthenticate(header: string | null): { resourceMetadata: string | null; scope: string | null } {
  const pick = (key: string) => new RegExp(`${key}="([^"]*)"`, 'i').exec(header ?? '')?.[1] ?? null;
  return { resourceMetadata: pick('resource_metadata'), scope: pick('scope') };
}

/** 応答の本文から、自分の要求（id）への応答を取り出す。SSE は途中の通知を読み飛ばし、応答が来た所で読むのをやめる。 */
async function readRpc(response: Response, id: number, maxBytes: number): Promise<{ result?: unknown; error?: unknown }> {
  const sse = (response.headers.get('content-type') ?? '').includes('text/event-stream');
  const reader = response.body?.getReader();
  if (!reader) throw new NoahMouthError('incompatible', '応答がありません。');
  const decoder = new TextDecoder();
  const mine = (text: string) => {
    try {
      const m = JSON.parse(text) as { id?: unknown; result?: unknown; error?: unknown };
      return m && typeof m === 'object' && m.id === id && ('result' in m || 'error' in m) ? m : null;
    } catch {
      return null;
    }
  };
  let text = '';
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new NoahMouthError('too_large', '応答が大きすぎます。');
      }
      text += decoder.decode(value, { stream: true });
    }
    if (sse) {
      const events = text.split(/\r?\n\r?\n/);
      text = done ? '' : events.pop() ?? '';
      for (const event of events) {
        const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
        const message = data ? mine(data) : null;
        if (message) {
          await reader.cancel();
          return message;
        }
      }
    }
    if (done) break;
  }
  const message = sse ? null : mine(text);
  if (!message) throw new NoahMouthError('incompatible', '応答を読めませんでした。');
  return message;
}

async function rpc(session: NoahMcpSession, ctx: NoahMouthContext, method: string, params: unknown, timeoutMs: number, notify = false): Promise<unknown> {
  const id = notify ? null : session.nextId++;
  const headers: Record<string, string> = {
    ...(ctx.headers ? await ctx.headers() : {}),
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': session.protocol,
    ...(session.sessionId ? { 'mcp-session-id': session.sessionId } : {}),
  };
  const timeout = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await ctx.fetch(session.url, {
      method: 'POST', headers, cache: 'no-store',
      signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
      body: JSON.stringify({ jsonrpc: '2.0', ...(id === null ? {} : { id }), method, ...(params === undefined ? {} : { params }) }),
    });
  } catch (error) {
    if (error instanceof NoahMouthError) throw error;
    throw new NoahMouthError('unreachable', '接続先が応答しません。');
  }
  if (response.status === 401) {
    await response.body?.cancel();
    throw new NoahMouthError('auth_required', '相手の許可が要ります。', parseNoahWwwAuthenticate(response.headers.get('www-authenticate')));
  }
  if (response.status === 402) { await response.body?.cancel(); throw new NoahMouthError('payment_required', '呼ぶたびの支払いが要る接続先です。'); }
  if (response.status === 403) { await response.body?.cancel(); throw new NoahMouthError('forbidden', '接続先が拒否しました。'); }
  if (response.status === 429) {
    await response.body?.cancel();
    const after = Number(response.headers.get('retry-after'));
    throw new NoahMouthError('rate_limited', '接続先が混んでいます。', { retryAfterSeconds: Number.isFinite(after) && after > 0 ? Math.min(after, 86_400) : 60 });
  }
  if (id === null) { await response.body?.cancel(); return null; }
  if (!response.ok) {
    await response.body?.cancel();
    // 404・410（無くなった）・5xx は「応答しない」。それ以外の 4xx は「形が合わない」。
    const gone = response.status === 404 || response.status === 410 || response.status >= 500;
    throw new NoahMouthError(gone ? 'unreachable' : 'incompatible', `接続先が ${response.status} を返しました。`, { status: response.status });
  }
  if (session.sessionId === null) {
    const raw = response.headers.get('mcp-session-id');
    if (raw && !SESSION_ID.test(raw)) throw new NoahMouthError('incompatible', 'セッションの値の形が違います。');
    session.sessionId = raw;
  }
  const message = await readRpc(response, id, ctx.maxBytes ?? NOAH_MOUTH_LIMITS.maxBytes);
  if (message.error) throw new NoahMouthError('incompatible', '接続先がエラーを返しました。', { rpc: message.error });
  return message.result;
}

/** 道具の定義の hash。名前順に並べ、決まった順の JSON にして sha256。承認した後の差し替えを見つけるのに使う。 */
export function noahToolsSha256(tools: NoahToolDef[]): Promise<string> {
  return sha256Hex(canonicalJson([...tools].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))));
}

/**
 * 握手 → 初期化の通知 → 道具の一覧。道具は呼ばない。
 * 最新の版を名乗り、相手がエラーを返した時だけ、1 つ前の版でもう 1 回だけ試す。
 */
export async function noahMcpHandshake(rawUrl: string, ctx: NoahMouthContext): Promise<NoahHandshake> {
  const hello = async (version: string) => {
    const attempt: NoahMcpSession = { url: rawUrl, protocol: version, sessionId: null, nextId: 1 };
    const result = await rpc(attempt, ctx, 'initialize', { protocolVersion: version, capabilities: {}, clientInfo: CLIENT_INFO }, NOAH_MOUTH_LIMITS.handshakeMs);
    return { attempt, result: result as { protocolVersion?: unknown; serverInfo?: { name?: unknown } } };
  };
  let first: Awaited<ReturnType<typeof hello>>;
  try {
    first = await hello(NOAH_MCP_PROTOCOLS[0]);
  } catch (error) {
    if (!(error instanceof NoahMouthError) || error.code !== 'incompatible') throw error;
    first = await hello(NOAH_MCP_PROTOCOLS[1]);
  }
  const session = first.attempt;
  const initialized = first.result;
  if (typeof initialized?.protocolVersion !== 'string' || !NOAH_MCP_PROTOCOLS.includes(initialized.protocolVersion))
    throw new NoahMouthError('incompatible', '対応していない版です。', { protocolVersion: initialized?.protocolVersion ?? null });
  session.protocol = initialized.protocolVersion;
  // 通知の失敗は握手の失敗にしない（202 を返さない相手がいる）。401 だけは上へ伝える。
  await rpc(session, ctx, 'notifications/initialized', undefined, 6_000, true).catch((error) => {
    if (error instanceof NoahMouthError && error.code === 'auth_required') throw error;
  });

  const tools: NoahToolDef[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let cursor: string | undefined;
  for (let page = 0; page < NOAH_MOUTH_LIMITS.toolPages; page++) {
    const listed = (await rpc(session, ctx, 'tools/list', cursor ? { cursor } : {}, NOAH_MOUTH_LIMITS.handshakeMs)) as { tools?: unknown; nextCursor?: unknown };
    if (!Array.isArray(listed?.tools)) throw new NoahMouthError('incompatible', '道具の一覧の形が違います。');
    for (const raw of listed.tools as { name?: unknown; description?: unknown; inputSchema?: unknown; annotations?: { readOnlyHint?: unknown } }[]) {
      if (typeof raw?.name !== 'string' || !TOOL_NAME.test(raw.name) || seen.has(raw.name)) { skipped++; continue; }
      if (tools.length >= NOAH_MOUTH_LIMITS.maxTools) throw new NoahMouthError('too_large', '道具が多すぎます。');
      seen.add(raw.name);
      tools.push({
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : '',
        inputSchema: raw.inputSchema && typeof raw.inputSchema === 'object' ? raw.inputSchema : { type: 'object' },
        readOnly: raw.annotations?.readOnlyHint === true,
      });
    }
    cursor = typeof listed.nextCursor === 'string' && listed.nextCursor ? listed.nextCursor : undefined;
    if (!cursor) break;
  }
  return {
    session,
    protocol: session.protocol,
    serverName: typeof initialized.serverInfo?.name === 'string' ? initialized.serverInfo.name.slice(0, 120) : '',
    tools,
    toolsSha256: await noahToolsSha256(tools),
    allReadOnly: tools.length > 0 && tools.every((tool) => tool.readOnly),
    skippedTools: skipped,
  };
}

/**
 * 道具を 1 回呼ぶ。失敗しても、口は自分で呼び直さない（相手で実行されたかどうかが分からないため）。
 * content は、構造のある結果があればそれ、無ければ部分の並び（道具を持つ担当が読む）。
 * blocks は、部分の並びそのまま（入力欄で頼む方が、人に見せる文を作るのに使う。noah-form-v1.ts の noahResultText）。
 */
export async function noahMcpCall(
  session: NoahMcpSession, name: string, args: unknown, ctx: NoahMouthContext, timeoutMs: number = NOAH_MOUTH_LIMITS.callMs,
): Promise<{ ok: boolean; content: unknown; blocks: unknown[] }> {
  const result = (await rpc(session, ctx, 'tools/call', { name, arguments: args ?? {} }, timeoutMs)) as {
    isError?: unknown; structuredContent?: unknown; content?: unknown;
  };
  return { ok: result?.isError !== true, content: result?.structuredContent ?? result?.content ?? null, blocks: Array.isArray(result?.content) ? result.content : [] };
}

/** セッションを閉じる。相手が対応していなくても失敗にしない。 */
export async function noahMcpClose(session: NoahMcpSession, ctx: NoahMouthContext): Promise<void> {
  if (!session.sessionId) return;
  await ctx
    .fetch(session.url, {
      method: 'DELETE',
      headers: { ...(ctx.headers ? await ctx.headers() : {}), 'mcp-session-id': session.sessionId, 'mcp-protocol-version': session.protocol },
      signal: AbortSignal.timeout(5_000),
    })
    .then((response) => response.body?.cancel())
    .catch(() => undefined);
}

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
