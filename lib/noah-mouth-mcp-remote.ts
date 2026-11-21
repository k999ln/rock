// Promoted from docs/contracts/noah-mouth-v1.ts for launch L4.
import {
  MCP_PROTOCOLS,
  McpInspectionError,
  remoteMcpUrl,
} from './mcp-inspection.ts';
import { canonicalJson, sha256Hex } from './noah-connect-requirements.ts';

/** 口が受け入れる版。先頭を最初に名乗る。2024-11-05 は実測で 1.5% が返す（道具の形は同じ。読み取りだけの宣言は無い）。 */
export const NOAH_MCP_PROTOCOLS: readonly string[] = [
  ...MCP_PROTOCOLS,
  '2024-11-05',
];
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

export type NoahToolDef = {
  name: string;
  description: string;
  inputSchema: unknown;
  readOnly: boolean;
};
export type NoahMouthContext = {
  /** 検査済みの fetch。createNoahGuardedFetch を通した物を渡す。 */
  fetch: typeof fetch;
  /** 中継が付ける header（Authorization や、本人が入れた鍵）。口の外へ出さない。 */
  headers?: () => Promise<Record<string, string>>;
  signal?: AbortSignal;
  maxBytes?: number;
};
export type NoahMouthCode =
  | 'auth_required' // 401。相手の許可が要る
  | 'payment_required' // 402。呼ぶたびの支払いが要る（未対応）
  | 'forbidden' // 403
  | 'rate_limited' // 429。detail.retryAfterSeconds
  | 'unreachable' // 名前が引けない、つながらない、時間切れ、404、410、5xx
  | 'incompatible' // 応答が読めない、版が合わない、相手がエラーを返した
  | 'too_large' // 応答が上限を越えた
  | 'blocked'; // 接続先が検査を通らない
export class NoahMouthError extends Error {
  code: NoahMouthCode;
  detail: Record<string, unknown>;
  constructor(
    code: NoahMouthCode,
    message: string,
    detail: Record<string, unknown> = {},
  ) {
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
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(
    ip,
  );
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!ip.includes(':')) return true; // アドレスの形でない物は通さない
  return (
    ip === '::' ||
    ip === '::1' ||
    /^f[cd]/.test(ip) ||
    /^fe[89ab]/.test(ip) ||
    ip.startsWith('ff') ||
    ip.startsWith('64:ff9b:') ||
    ip.startsWith('2001:db8:')
  );
}

/**
 * 接続先を検査してから通す fetch を作る。HTTPS の公開の名前だけ。転送は自分で追い、毎回検査する。
 * check は、名前を引いた先のアドレスを確かめる差し込み口（Node では dns.lookup と isNoahPrivateAddress）。
 * sameHost が真の時は、別の host への転送に従わない（本人に見せた送り先の外へ、入力を送らない。
 * 接続要件の egress が、その接続先の host 1 つだけである事と対になる）。ローンチの握手・接続・依頼は、真で使う。
 */
export function createNoahGuardedFetch(
  base: typeof fetch,
  options: {
    check?: (url: URL) => Promise<void>;
    redirects?: number;
    sameHost?: boolean;
  } = {},
): typeof fetch {
  const inspect = async (raw: string) => {
    let url: URL;
    try {
      url = remoteMcpUrl(raw);
    } catch (error) {
      if (error instanceof McpInspectionError)
        throw new NoahMouthError('blocked', 'この接続先にはつなげません。');
      throw error;
    }
    await options.check?.(url);
    return url;
  };
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = await inspect(
      input instanceof Request ? input.url : input.toString(),
    );
    for (let hop = 0; ; hop++) {
      const response = await base(url, { ...init, redirect: 'manual' });
      const location = response.headers.get('location');
      if (response.status < 300 || response.status >= 400 || !location)
        return response;
      await response.body?.cancel();
      if (hop >= (options.redirects ?? NOAH_MOUTH_LIMITS.redirects))
        throw new NoahMouthError('blocked', '転送が多すぎます。');
      const next = await inspect(new URL(location, url).toString());
      if (options.sameHost && next.host !== url.host)
        throw new NoahMouthError(
          'blocked',
          '別の接続先への転送には従いません。',
          { redirectedTo: next.host },
        );
      // 別の host への転送で、本人の許可や鍵を持ち出さない。
      if (next.host !== url.host && init?.headers)
        init = { ...init, headers: stripCredentials(init.headers) };
      url = next;
    }
  }) as typeof fetch;
}
function stripCredentials(headers: HeadersInit): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(headers).forEach((value, key) => {
    if (
      ['content-type', 'accept', 'mcp-protocol-version', 'user-agent'].includes(
        key,
      )
    )
      out[key] = value;
  });
  return out;
}

// ---------------------------------------------------------------------------
// 握手・道具の一覧・道具の呼び出し
// ---------------------------------------------------------------------------

export type NoahMcpSession = {
  url: string;
  protocol: string;
  sessionId: string | null;
  nextId: number;
};
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
export function parseNoahWwwAuthenticate(header: string | null): {
  resourceMetadata: string | null;
  scope: string | null;
} {
  const pick = (key: string) =>
    new RegExp(`${key}="([^"]*)"`, 'i').exec(header ?? '')?.[1] ?? null;
  return { resourceMetadata: pick('resource_metadata'), scope: pick('scope') };
}

/** 応答の本文から、自分の要求（id）への応答を取り出す。SSE は途中の通知を読み飛ばし、応答が来た所で読むのをやめる。 */
async function readRpc(
  response: Response,
  id: number,
  maxBytes: number,
): Promise<{ result?: unknown; error?: unknown }> {
  const sse = (response.headers.get('content-type') ?? '').includes(
    'text/event-stream',
  );
  const reader = response.body?.getReader();
  if (!reader) throw new NoahMouthError('incompatible', '応答がありません。');
  const decoder = new TextDecoder();
  const mine = (text: string) => {
    try {
      const m = JSON.parse(text) as {
        id?: unknown;
        result?: unknown;
        error?: unknown;
      };
      return m &&
        typeof m === 'object' &&
        m.id === id &&
        ('result' in m || 'error' in m)
        ? m
        : null;
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
      text = done ? '' : (events.pop() ?? '');
      for (const event of events) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trim())
          .join('\n');
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
  if (!message)
    throw new NoahMouthError('incompatible', '応答を読めませんでした。');
  return message;
}

async function rpc(
  session: NoahMcpSession,
  ctx: NoahMouthContext,
  method: string,
  params: unknown,
  timeoutMs: number,
  notify = false,
): Promise<unknown> {
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
      method: 'POST',
      headers,
      cache: 'no-store',
      signal: ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout,
      body: JSON.stringify({
        jsonrpc: '2.0',
        ...(id === null ? {} : { id }),
        method,
        ...(params === undefined ? {} : { params }),
      }),
    });
  } catch (error) {
    if (error instanceof NoahMouthError) throw error;
    throw new NoahMouthError('unreachable', '接続先が応答しません。');
  }
  if (response.status === 401) {
    await response.body?.cancel();
    throw new NoahMouthError(
      'auth_required',
      '相手の許可が要ります。',
      parseNoahWwwAuthenticate(response.headers.get('www-authenticate')),
    );
  }
  if (response.status === 402) {
    await response.body?.cancel();
    throw new NoahMouthError(
      'payment_required',
      '呼ぶたびの支払いが要る接続先です。',
    );
  }
  if (response.status === 403) {
    await response.body?.cancel();
    throw new NoahMouthError('forbidden', '接続先が拒否しました。');
  }
  if (response.status === 429) {
    await response.body?.cancel();
    const after = Number(response.headers.get('retry-after'));
    throw new NoahMouthError('rate_limited', '接続先が混んでいます。', {
      retryAfterSeconds:
        Number.isFinite(after) && after > 0 ? Math.min(after, 86_400) : 60,
    });
  }
  if (id === null) {
    await response.body?.cancel();
    return null;
  }
  if (!response.ok) {
    await response.body?.cancel();
    // 404・410（無くなった）・5xx は「応答しない」。それ以外の 4xx は「形が合わない」。
    const gone =
      response.status === 404 ||
      response.status === 410 ||
      response.status >= 500;
    throw new NoahMouthError(
      gone ? 'unreachable' : 'incompatible',
      `接続先が ${response.status} を返しました。`,
      { status: response.status },
    );
  }
  if (session.sessionId === null) {
    const raw = response.headers.get('mcp-session-id');
    if (raw && !SESSION_ID.test(raw))
      throw new NoahMouthError(
        'incompatible',
        'セッションの値の形が違います。',
      );
    session.sessionId = raw;
  }
  const message = await readRpc(
    response,
    id,
    ctx.maxBytes ?? NOAH_MOUTH_LIMITS.maxBytes,
  );
  if (message.error)
    throw new NoahMouthError('incompatible', '接続先がエラーを返しました。', {
      rpc: message.error,
    });
  return message.result;
}

/** 道具の定義の hash。名前順に並べ、決まった順の JSON にして sha256。承認した後の差し替えを見つけるのに使う。 */
export function noahToolsSha256(tools: NoahToolDef[]): Promise<string> {
  return sha256Hex(
    canonicalJson(
      [...tools].sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      ),
    ),
  );
}

/**
 * 握手 → 初期化の通知 → 道具の一覧。道具は呼ばない。
 * 最新の版を名乗り、相手がエラーを返した時だけ、1 つ前の版でもう 1 回だけ試す。
 */
export async function noahMcpHandshake(
  rawUrl: string,
  ctx: NoahMouthContext,
): Promise<NoahHandshake> {
  const hello = async (version: string) => {
    const attempt: NoahMcpSession = {
      url: rawUrl,
      protocol: version,
      sessionId: null,
      nextId: 1,
    };
    const result = await rpc(
      attempt,
      ctx,
      'initialize',
      { protocolVersion: version, capabilities: {}, clientInfo: CLIENT_INFO },
      NOAH_MOUTH_LIMITS.handshakeMs,
    );
    return {
      attempt,
      result: result as {
        protocolVersion?: unknown;
        serverInfo?: { name?: unknown };
      },
    };
  };
  let first: Awaited<ReturnType<typeof hello>>;
  try {
    first = await hello(NOAH_MCP_PROTOCOLS[0]);
  } catch (error) {
    if (!(error instanceof NoahMouthError) || error.code !== 'incompatible')
      throw error;
    first = await hello(NOAH_MCP_PROTOCOLS[1]);
  }
  const session = first.attempt;
  const initialized = first.result;
  if (
    typeof initialized?.protocolVersion !== 'string' ||
    !NOAH_MCP_PROTOCOLS.includes(initialized.protocolVersion)
  )
    throw new NoahMouthError('incompatible', '対応していない版です。', {
      protocolVersion: initialized?.protocolVersion ?? null,
    });
  session.protocol = initialized.protocolVersion;
  // 通知の失敗は握手の失敗にしない（202 を返さない相手がいる）。401 だけは上へ伝える。
  await rpc(
    session,
    ctx,
    'notifications/initialized',
    undefined,
    6_000,
    true,
  ).catch((error) => {
    if (error instanceof NoahMouthError && error.code === 'auth_required')
      throw error;
  });

  const tools: NoahToolDef[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let cursor: string | undefined;
  for (let page = 0; page < NOAH_MOUTH_LIMITS.toolPages; page++) {
    const listed = (await rpc(
      session,
      ctx,
      'tools/list',
      cursor ? { cursor } : {},
      NOAH_MOUTH_LIMITS.handshakeMs,
    )) as { tools?: unknown; nextCursor?: unknown };
    if (!Array.isArray(listed?.tools))
      throw new NoahMouthError('incompatible', '道具の一覧の形が違います。');
    for (const raw of listed.tools as {
      name?: unknown;
      description?: unknown;
      inputSchema?: unknown;
      annotations?: { readOnlyHint?: unknown };
    }[]) {
      if (
        typeof raw?.name !== 'string' ||
        !TOOL_NAME.test(raw.name) ||
        seen.has(raw.name)
      ) {
        skipped++;
        continue;
      }
      if (tools.length >= NOAH_MOUTH_LIMITS.maxTools)
        throw new NoahMouthError('too_large', '道具が多すぎます。');
      seen.add(raw.name);
      tools.push({
        name: raw.name,
        description: typeof raw.description === 'string' ? raw.description : '',
        inputSchema:
          raw.inputSchema && typeof raw.inputSchema === 'object'
            ? raw.inputSchema
            : { type: 'object' },
        readOnly: raw.annotations?.readOnlyHint === true,
      });
    }
    cursor =
      typeof listed.nextCursor === 'string' && listed.nextCursor
        ? listed.nextCursor
        : undefined;
    if (!cursor) break;
  }
  return {
    session,
    protocol: session.protocol,
    serverName:
      typeof initialized.serverInfo?.name === 'string'
        ? initialized.serverInfo.name.slice(0, 120)
        : '',
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
  session: NoahMcpSession,
  name: string,
  args: unknown,
  ctx: NoahMouthContext,
  timeoutMs: number = NOAH_MOUTH_LIMITS.callMs,
): Promise<{ ok: boolean; content: unknown; blocks: unknown[] }> {
  const result = (await rpc(
    session,
    ctx,
    'tools/call',
    { name, arguments: args ?? {} },
    timeoutMs,
  )) as {
    isError?: unknown;
    structuredContent?: unknown;
    content?: unknown;
  };
  if (
    !result ||
    typeof result !== 'object' ||
    (!Array.isArray(result.content) &&
      (result.structuredContent === undefined ||
        result.structuredContent === null))
  )
    throw new NoahMouthError(
      'incompatible',
      '成果の形を確認できませんでした。',
    );
  return {
    ok: result?.isError !== true,
    content: result?.structuredContent ?? result?.content ?? null,
    blocks: Array.isArray(result?.content) ? result.content : [],
  };
}

/** セッションを閉じる。相手が対応していなくても失敗にしない。 */
export async function noahMcpClose(
  session: NoahMcpSession,
  ctx: NoahMouthContext,
): Promise<void> {
  if (!session.sessionId) return;
  await ctx
    .fetch(session.url, {
      method: 'DELETE',
      headers: {
        ...(ctx.headers ? await ctx.headers() : {}),
        'mcp-session-id': session.sessionId,
        'mcp-protocol-version': session.protocol,
      },
      signal: AbortSignal.timeout(5_000),
    })
    .then((response) => response.body?.cancel())
    .catch(() => undefined);
}
