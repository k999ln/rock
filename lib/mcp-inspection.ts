export const MCP_PROTOCOLS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
] as const;

export type McpInspection = {
  status: 'ready' | 'auth_required' | 'unreachable';
  protocolVersion: string | null;
  serverName: string | null;
  toolCount: number;
  toolNames: string[];
  message: string;
};

type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

type RpcEnvelope = {
  error?: { message?: unknown };
  result?: Record<string, unknown>;
};

const MAX_RESPONSE_BYTES = 256 * 1024;
const MAX_TOOLS = 100;

function numericHostname(hostname: string) {
  return /^(?:\d+\.){0,3}\d+$/.test(hostname);
}

export class McpInspectionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function remoteMcpUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 500)
    throw new McpInspectionError('MCPの接続先URLを確認してください。');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new McpInspectionError('MCPの接続先URLを確認してください。');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
  const blockedSuffixes = [
    'localhost',
    '.localhost',
    '.local',
    '.internal',
    '.lan',
    '.test',
    '.invalid',
    '.onion',
  ];
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.hash ||
    !hostname ||
    hostname.includes(':') ||
    numericHostname(hostname) ||
    blockedSuffixes.some(
      (suffix) => hostname === suffix || hostname.endsWith(suffix),
    )
  )
    throw new McpInspectionError(
      '公開HTTPSのMCP接続先を指定してください。ローカル・内部ネットワークは掲載診断できません。',
    );
  return parsed;
}

async function limitedText(response: Response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new McpInspectionError('MCPの応答が大きすぎます。', 422);
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

function rpcEnvelope(text: string, contentType: string | null): RpcEnvelope {
  const payloads = contentType?.includes('text/event-stream')
    ? text
        .split(/\r?\n\r?\n/)
        .flatMap((event) =>
          event
            .split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim()),
        )
        .filter((line) => line && line !== '[DONE]')
    : [text];
  for (let index = payloads.length - 1; index >= 0; index -= 1) {
    try {
      const value = JSON.parse(payloads[index]) as unknown;
      if (value && typeof value === 'object' && !Array.isArray(value))
        return value as RpcEnvelope;
    } catch {
      // Try an earlier SSE data frame before reporting a malformed response.
    }
  }
  throw new McpInspectionError('MCPの応答形式を確認できませんでした。', 422);
}

async function rpcResponse(response: Response) {
  const envelope = rpcEnvelope(
    await limitedText(response),
    response.headers.get('content-type'),
  );
  if (envelope.error)
    throw new McpInspectionError(
      typeof envelope.error.message === 'string'
        ? `MCPエラー: ${envelope.error.message.slice(0, 160)}`
        : 'MCPが接続確認を拒否しました。',
      422,
    );
  if (!envelope.result)
    throw new McpInspectionError('MCPの応答に結果がありません。', 422);
  return envelope.result;
}

function requestHeaders(protocolVersion?: string, sessionId?: string) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
    ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
  };
}

function authResult(): McpInspection {
  return {
    status: 'auth_required',
    protocolVersion: null,
    serverName: null,
    toolCount: 0,
    toolNames: [],
    message:
      '接続先は応答しました。公開前の審査でOAuth認証後にツール一覧を確認します。',
  };
}

export async function inspectRemoteMcp(
  endpoint: unknown,
  fetcher: FetchLike = fetch,
): Promise<McpInspection> {
  const url = remoteMcpUrl(endpoint);
  const call = async (
    id: string,
    method: string,
    params: Record<string, unknown>,
    protocolVersion?: string,
    sessionId?: string,
  ) =>
    fetcher(url, {
      method: 'POST',
      headers: requestHeaders(protocolVersion, sessionId),
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });

  try {
    const initializedResponse = await call('sky-init', 'initialize', {
      protocolVersion: MCP_PROTOCOLS[0],
      capabilities: {},
      clientInfo: { name: 'sky-listing-inspector', version: '1.0.0' },
    });
    if (initializedResponse.status === 401) return authResult();
    if (!initializedResponse.ok)
      return {
        status: 'unreachable',
        protocolVersion: null,
        serverName: null,
        toolCount: 0,
        toolNames: [],
        message: `MCPが接続確認に応答しませんでした（HTTP ${initializedResponse.status}）。`,
      };

    const initialized = await rpcResponse(initializedResponse);
    const protocolVersion = initialized.protocolVersion;
    if (
      typeof protocolVersion !== 'string' ||
      !MCP_PROTOCOLS.includes(protocolVersion as (typeof MCP_PROTOCOLS)[number])
    )
      throw new McpInspectionError(
        'Skyが対応していないMCPバージョンです。',
        422,
      );
    const capabilities = initialized.capabilities;
    if (
      !capabilities ||
      typeof capabilities !== 'object' ||
      !('tools' in capabilities)
    )
      throw new McpInspectionError(
        'このMCPはツール機能を公開していません。',
        422,
      );
    const rawSessionId = initializedResponse.headers.get('mcp-session-id');
    const sessionId =
      rawSessionId && /^[\x21-\x7e]{1,512}$/.test(rawSessionId)
        ? rawSessionId
        : undefined;
    if (rawSessionId && !sessionId)
      throw new McpInspectionError('MCPのセッション情報が不正です。', 422);

    const notification = await fetcher(url, {
      method: 'POST',
      headers: requestHeaders(protocolVersion, sessionId),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!notification.ok)
      throw new McpInspectionError(
        'MCPの初期接続を完了できませんでした。',
        422,
      );

    const names: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const listedResponse = await call(
        `sky-tools-${page}`,
        'tools/list',
        cursor ? { cursor } : {},
        protocolVersion,
        sessionId,
      );
      if (!listedResponse.ok)
        throw new McpInspectionError(
          'MCPのツール一覧を取得できませんでした。',
          422,
        );
      const listed = await rpcResponse(listedResponse);
      if (!Array.isArray(listed.tools))
        throw new McpInspectionError('MCPのツール一覧が不正です。', 422);
      for (const tool of listed.tools) {
        if (
          !tool ||
          typeof tool !== 'object' ||
          !('name' in tool) ||
          typeof tool.name !== 'string' ||
          !/^[A-Za-z0-9_.:-]{1,128}$/.test(tool.name)
        )
          throw new McpInspectionError(
            'MCPのツール名を確認できませんでした。',
            422,
          );
        if (!names.includes(tool.name)) names.push(tool.name);
        if (names.length > MAX_TOOLS)
          throw new McpInspectionError(
            `掲載診断で確認できるツールは${MAX_TOOLS}件までです。`,
            422,
          );
      }
      cursor =
        typeof listed.nextCursor === 'string' ? listed.nextCursor : undefined;
      if (!cursor) break;
      if (page === 4)
        throw new McpInspectionError(
          'ツール一覧のページ数が上限を超えました。',
          422,
        );
    }
    if (!names.length)
      throw new McpInspectionError(
        '利用できるMCPツールが見つかりませんでした。',
        422,
      );

    const serverInfo = initialized.serverInfo;
    const serverName =
      serverInfo &&
      typeof serverInfo === 'object' &&
      'name' in serverInfo &&
      typeof serverInfo.name === 'string'
        ? serverInfo.name.slice(0, 120)
        : null;
    return {
      status: 'ready',
      protocolVersion,
      serverName,
      toolCount: names.length,
      toolNames: names,
      message: `${names.length}件のツールを確認しました。ツールはまだ実行していません。`,
    };
  } catch (error) {
    if (error instanceof McpInspectionError) throw error;
    return {
      status: 'unreachable',
      protocolVersion: null,
      serverName: null,
      toolCount: 0,
      toolNames: [],
      message:
        'MCPへ接続できませんでした。URL、起動状態、公開範囲を確認してください。',
    };
  }
}
