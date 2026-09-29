import { ensureLocalRuntime } from '@/lib/sky-local-runtime';

export const FASHION_MCP_URL = 'http://127.0.0.1:8787';
export const FASHION_MCP_TOOL_COUNT = 41;

const TOKEN_KEY = 'sky.fashion-mcp.session';
const PROTOCOL_KEY = 'sky.fashion-mcp.protocol';
const SUPPORTED_PROTOCOLS = new Set(['2025-11-25', '2025-06-18']);
const REQUIRED_TOOLS = [
  'fashion.producer.start',
  'fashion.autopilot.run',
  'fashion.system.readiness',
  'instagram.accounts.intake_screenshots',
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
  structuredContent?: unknown;
  isError?: boolean;
};

export type FashionProducerInput = {
  run_id: string;
  worldview: string;
  product_design: string;
  region?: string;
};

export type FashionProducerResult = {
  run_id: string;
  idempotent_replay: boolean;
  brand: { id: string; name: string };
  product: { id: string; name: string };
  market: {
    primary_segment: string;
    audience: { age_range: string; regions: string[] };
    positioning: string;
  };
  content_plan: {
    id: string;
    strategy: { slots: { date: string; time: string; pillar: string; format: string }[] };
  };
  first_draft: { id: string; caption: string; status: string };
  creative: { brief: { prompt: string } };
  decisions_needed: { key: string; label: string; reason: string }[];
  approval_queue: { approval_id: string; action: string; status: string }[];
  external_effects_executed: false;
};

export type FashionReadiness = {
  planning_ready: boolean;
  capabilities: {
    instagram: { ready: boolean; provider: string };
    creative: { ready: boolean; provider: string };
    payment: { ready: boolean; provider: string };
    notification: { ready: boolean; provider: string };
  };
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
  }).catch(() => {
    throw new Error('PCのブランド運営へ応答を確認できませんでした。接続を再確認してください。');
  });
  if (response.status === 401) {
    clearStoredConnection();
    throw new Error('PCへの接続期限が切れました。もう一度接続してください。');
  }
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
    throw new Error('41個の専用操作を確認できませんでした。');
  const names = new Set(tools.map((tool) => tool?.name));
  if (REQUIRED_TOOLS.some((name) => !names.has(name)))
    throw new Error('必要なInstagram運用操作を確認できませんでした。');
}

export function fashionMcpConnected() {
  return Boolean(stored(TOKEN_KEY));
}

async function establishFashionMcpConnection() {
  const generation = ++connectionGeneration;
  await ensureLocalRuntime('fashion');
  const response = await fetch(FASHION_MCP_URL + '/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  }).catch(() => {
    throw new Error('PCのブランド運営を起動できていません。接続を再確認してください。');
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

export async function callFashionMcpTool<T>(
  name: string,
  args: Record<string, unknown> = {},
) {
  const token = stored(TOKEN_KEY);
  if (!token) throw new Error('Fashion Brand Ops MCPは未接続です。');
  const result = await rpc(token, 'tools/call', { name, arguments: args });
  if (result.isError) {
    const error = result.structuredContent as { error?: string } | undefined;
    throw new Error(error?.error || '操作を完了できませんでした。');
  }
  if (result.structuredContent === undefined)
    throw new Error('操作結果を確認できませんでした。');
  return result.structuredContent as T;
}

export async function verifyFashionProducerSaved(result: FashionProducerResult) {
  const drafts = await callFashionMcpTool<
    { id: string; brand_id: string; caption: string; status: string }[]
  >('instagram.calendar.list', { brand_id: result.brand.id });
  const saved = Array.isArray(drafts) ? drafts.find((draft) => draft.id === result.first_draft.id) : undefined;
  if (!saved || saved.brand_id !== result.brand.id || saved.caption !== result.first_draft.caption)
    throw new Error('保存した下書きを確認できませんでした。同じ入力で再確認してください。');
  return saved;
}

export async function startFashionProducer(input: FashionProducerInput) {
  const result = await callFashionMcpTool<FashionProducerResult>('fashion.producer.start', input);
  if (!result || result.run_id !== input.run_id || result.external_effects_executed !== false ||
      typeof result.brand?.id !== 'string' || typeof result.product?.name !== 'string' ||
      typeof result.first_draft?.id !== 'string' || typeof result.first_draft?.caption !== 'string' ||
      typeof result.market?.primary_segment !== 'string' || typeof result.market?.audience?.age_range !== 'string' ||
      typeof result.market?.positioning !== 'string' || !Array.isArray(result.market?.audience?.regions) ||
      !result.market.audience.regions.every((region) => typeof region === 'string') ||
      typeof result.creative?.brief?.prompt !== 'string' || !Array.isArray(result.content_plan?.strategy?.slots) ||
      !result.content_plan.strategy.slots.every((slot) => typeof slot.date === 'string' && typeof slot.time === 'string' && typeof slot.format === 'string' && typeof slot.pillar === 'string') ||
      !Array.isArray(result.decisions_needed) || !result.decisions_needed.every((item) => typeof item.key === 'string' && typeof item.label === 'string' && typeof item.reason === 'string') ||
      !Array.isArray(result.approval_queue))
    throw new Error('作成結果の形式を確認できませんでした。同じ入力で再確認してください。');
  await verifyFashionProducerSaved(result);
  return result;
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
