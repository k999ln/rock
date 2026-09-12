export const FASHION_MCP_URL = 'http://127.0.0.1:8787';
export const FASHION_MCP_TOOL_COUNT = 38;

const TOKEN_KEY = 'sky.fashion-mcp.session';
const PROTOCOL_KEY = 'sky.fashion-mcp.protocol';
const SUPPORTED_PROTOCOLS = new Set(['2025-11-25', '2025-06-18']);
const REQUIRED_TOOLS = [
  'fashion.autopilot.run',
  'fashion.system.readiness',
  'instagram.accounts.discover',
  'instagram.content_plan.create',
  'instagram.draft.create',
  'instagram.publish.prepare',
  'instagram.insights.sync',
  'instagram.dm.classify',
  'approval.execute',
];

type McpResult = {
  protocolVersion?: string;
  tools?: { name?: string }[];
};

let connectionGeneration = 0;
let activeConnect: Promise<{
  protocolVersion: string;
  toolCount: number;
}> | null = null;

function stored(key: string) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function clearStoredConnection() {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(PROTOCOL_KEY);
  } catch {}
  window.dispatchEvent(new Event('sky-fashion-mcp'));
}

async function rpc(
  token: string,
  method: string,
  params: unknown = {},
  protocolVersion = stored(PROTOCOL_KEY),
) {
  const response = await fetch(FASHION_MCP_URL + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + token,
      ...(protocolVersion ? { 'MCP-Protocol-Version': protocolVersion } : {}),
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: crypto.randomUUID(),
      method,
      params,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  const message = (await response.json()) as {
    error?: { message?: string };
    result?: McpResult;
  };
  if (!response.ok || message.error || !message.result)
    throw new Error('Fashion Brand Ops MCPから正常な応答がありません。');
  return message.result;
}

function validateTools(tools: McpResult['tools']) {
  if (!Array.isArray(tools) || tools.length !== FASHION_MCP_TOOL_COUNT)
    throw new Error('38個の専用操作を確認できませんでした。');
  const names = new Set(tools.map((tool) => tool?.name));
  if (REQUIRED_TOOLS.some((name) => !names.has(name)))
    throw new Error('必要なInstagram運用操作を確認できませんでした。');
}

export function fashionMcpConnected() {
  return Boolean(stored(TOKEN_KEY));
}

async function establishFashionMcpConnection() {
  const generation = ++connectionGeneration;
  const response = await fetch(FASHION_MCP_URL + '/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  const connection = (await response.json()) as {
    token?: string;
    server?: string;
  };
  if (
    !response.ok ||
    connection.server !== 'fashion-brand-ops-mcp' ||
    typeof connection.token !== 'string' ||
    connection.token.length < 40
  )
    throw new Error('Sky接続アプリを確認できませんでした。');

  const initialized = await rpc(
    connection.token,
    'initialize',
    {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'rockstaros-sky', version: '0.3.0' },
    },
    '',
  );
  if (
    !initialized.protocolVersion ||
    !SUPPORTED_PROTOCOLS.has(initialized.protocolVersion)
  )
    throw new Error('対応するMCPバージョンを確認できませんでした。');

  const notification = await fetch(FASHION_MCP_URL + '/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Bearer ' + connection.token,
      'MCP-Protocol-Version': initialized.protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  });
  if (notification.status !== 202)
    throw new Error('MCPの初期接続が完了しませんでした。');

  const listed = await rpc(
    connection.token,
    'tools/list',
    {},
    initialized.protocolVersion,
  );
  validateTools(listed.tools);
  if (generation !== connectionGeneration)
    throw new Error('接続確認は取り消されました。');

  sessionStorage.setItem(TOKEN_KEY, connection.token);
  sessionStorage.setItem(PROTOCOL_KEY, initialized.protocolVersion);
  window.dispatchEvent(new Event('sky-fashion-mcp'));
  return {
    protocolVersion: initialized.protocolVersion,
    toolCount: listed.tools!.length,
  };
}

export function connectFashionMcp() {
  if (activeConnect) return activeConnect;
  const attempt = establishFashionMcpConnection().finally(() => {
    if (activeConnect === attempt) activeConnect = null;
  });
  activeConnect = attempt;
  return attempt;
}

export async function verifyFashionMcp() {
  const token = stored(TOKEN_KEY);
  if (!token) throw new Error('Fashion Brand Ops MCPは未接続です。');
  try {
    await rpc(token, 'ping');
    const listed = await rpc(token, 'tools/list');
    validateTools(listed.tools);
    return { toolCount: listed.tools!.length };
  } catch (error) {
    clearStoredConnection();
    throw error;
  }
}

export async function disconnectFashionMcp() {
  connectionGeneration++;
  const token = stored(TOKEN_KEY);
  try {
    if (token)
      await fetch(FASHION_MCP_URL + '/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: '{}',
        cache: 'no-store',
        signal: AbortSignal.timeout(3000),
      });
  } finally {
    clearStoredConnection();
  }
}
