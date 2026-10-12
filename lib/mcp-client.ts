/** Browser-safe transport only. It never grants approval or retries a Tool call. */
export type McpRequestOptions = {
  baseUrl: string;
  token: string;
  protocolVersion?: string;
  accept: string;
  cache?: RequestCache;
  timeoutMs?: number;
};
export type McpConnectionProfile = Omit<McpRequestOptions, 'token' | 'protocolVersion'> & {
  protocols: readonly string[];
  clientInfo: { name: string; version: string };
  minimumTokenLength: number;
  serverName?: string;
  initializedStatus?: number;
};
export type McpTool = { name?: unknown };
export class McpClientError extends Error {
  readonly code: 'network' | 'http' | 'rpc' | 'response' | 'token' | 'protocol' | 'initialized';
  readonly phase: string;
  readonly status?: number;
  constructor(code: McpClientError['code'], phase: string, status?: number, message = 'MCP request failed') {
    super(message);
    this.code = code;
    this.phase = phase;
    this.status = status;
  }
}

async function post(
  options: Omit<McpRequestOptions, 'token'> & { token?: string },
  path: '/connect' | '/mcp',
  payload: object,
  phase: string,
) {
  try {
    return await fetch(options.baseUrl + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(path === '/mcp' ? { Accept: options.accept } : {}),
        ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
        ...(options.protocolVersion ? { 'MCP-Protocol-Version': options.protocolVersion } : {}),
      },
      body: JSON.stringify(payload),
      ...(options.cache ? { cache: options.cache } : {}),
      // A redirect must not move the local session or an approved operation elsewhere.
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? 5000),
    });
  } catch {
    throw new McpClientError('network', phase);
  }
}

async function objectResponse(response: Response, phase: string) {
  if (!response.ok) throw new McpClientError('http', phase, response.status);
  const value: unknown = await response.json().catch(() => null);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new McpClientError('response', phase, response.status);
  return value as Record<string, unknown>;
}

export async function requestMcp<T extends object>(
  options: McpRequestOptions,
  method: string,
  params?: unknown,
): Promise<T> {
  const requestId = crypto.randomUUID();
  const response = await post(options, '/mcp', {
    jsonrpc: '2.0', id: requestId, method,
    ...(params === undefined ? {} : { params }),
  }, method);
  const message = await objectResponse(response, method);
  // A response from another request (or a notification) cannot confirm this
  // approved Tool call. Never retry here: its actual execution may be unknown.
  if (message.jsonrpc !== '2.0' || message.id !== requestId ||
      ('result' in message) === ('error' in message))
    throw new McpClientError('protocol', method, response.status);
  if ('error' in message) {
    const detail = message.error;
    if (!detail || typeof detail !== 'object' || Array.isArray(detail) ||
        !Number.isInteger((detail as Record<string, unknown>).code) ||
        typeof (detail as Record<string, unknown>).message !== 'string')
      throw new McpClientError('protocol', method, response.status);
    throw new McpClientError('rpc', method, response.status,
      (detail as { message: string }).message);
  }
  if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result))
    throw new McpClientError('response', method, response.status);
  return message.result as T;
}

/** No browser session is published until the caller checks its own generation and Tool policy. */
export async function connectMcpSession(profile: McpConnectionProfile) {
  const connection = await objectResponse(await post(profile, '/connect', {}, 'connect'), 'connect');
  if (typeof connection.token !== 'string' || connection.token.length < profile.minimumTokenLength ||
      (profile.serverName !== undefined && connection.server !== profile.serverName))
    throw new McpClientError('token', 'connect');
  const session = { ...profile, token: connection.token };
  const initialized = await requestMcp<{ protocolVersion?: unknown }>(session, 'initialize', {
    protocolVersion: profile.protocols[0], capabilities: {}, clientInfo: profile.clientInfo,
  });
  if (typeof initialized.protocolVersion !== 'string' || !profile.protocols.includes(initialized.protocolVersion))
    throw new McpClientError('protocol', 'initialize');
  const negotiated = { ...session, protocolVersion: initialized.protocolVersion };
  const notification = await post(negotiated, '/mcp', {
    jsonrpc: '2.0', method: 'notifications/initialized',
  }, 'notifications/initialized');
  if (!notification.ok || (profile.initializedStatus !== undefined && notification.status !== profile.initializedStatus))
    throw new McpClientError('initialized', 'notifications/initialized', notification.status);
  const listed = await requestMcp<{ tools?: McpTool[] }>(negotiated, 'tools/list', {});
  return { token: connection.token, protocolVersion: initialized.protocolVersion, tools: listed.tools };
}

export function mcpToolNames(tools: readonly McpTool[] | undefined) {
  return new Set(Array.isArray(tools) ? tools.flatMap((tool) =>
    tool && typeof tool === 'object' && typeof tool.name === 'string' ? [tool.name] : [],
  ) : []);
}
