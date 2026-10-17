import { DEVICE_URL, deviceToken } from '@/lib/device';
import type { McpPlan } from './sky-mcp-plan';

export type McpConnectionState =
  | 'available'
  | 'connecting'
  | 'connected'
  | 'needs_authorization'
  | 'error';

export type McpToolPassport = {
  name: string;
  title: string | null;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  pricing: {
    model: 'free' | 'subscription' | 'usage' | 'external_contract' | 'unknown';
    note: string;
  };
  approval: 'required';
};

export type McpConnectionPassport = {
  server: { name: string; version: string };
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  tools: McpToolPassport[];
  toolDigest: string;
  connectedAt: string;
};

export type McpConnection = {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'streamable_http' | 'local_http';
  state: McpConnectionState;
  toolCount: number | null;
  passport: McpConnectionPassport | null;
};

export type McpApproval = {
  approvalToken: string;
  expiresAt: string;
  server: string;
  tool: string;
  toolId: string;
  summary: string;
  pricing: McpToolPassport['pricing'] & { declaration: 'provider_unverified' };
  approvalRequired: true;
};

export class McpHubError extends Error {
  code: string;

  constructor(message: string, code = 'mcp_hub_error') {
    super(message);
    this.code = code;
  }
}

async function connector<T>(path: string, init?: RequestInit): Promise<T> {
  const token = deviceToken();
  if (!token)
    throw new McpHubError(
      '先にSky MCP Connectorを起動して、このPCを接続してください。',
      'connector_not_connected',
    );
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const request = Object.assign({}, init, {
    headers,
    signal: init?.signal ?? AbortSignal.timeout(65_000),
  });
  const response = await fetch(`${DEVICE_URL}${path}`, request).catch(() => {
    throw new McpHubError(
      'PC内のSky MCP Connectorへ接続できません。',
      'connector_unavailable',
    );
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!response.ok)
    throw new McpHubError(
      data.message ?? 'MCP Connectorで処理できませんでした。',
      data.error,
    );
  return data as T;
}

export async function listMcpConnections() {
  const data = await connector<{ servers: McpConnection[] }>('/servers');
  return data.servers;
}

async function mcpConnectionKey(serverId: string) {
  const token = deviceToken();
  if (!token) throw new McpHubError('先にこのPCを接続してください。', 'connector_not_connected');
  // Only a one-way installation fingerprint leaves the device; never its bearer token.
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const fingerprint = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${fingerprint}:${serverId}`;
}

async function planRequest(method: 'GET' | 'POST' | 'DELETE', value?: unknown) {
  const response = await fetch('/api/sky/mcp/plan', { method, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' }, ...(value ? { body: JSON.stringify(value) } : {}) });
  const result = await response.json() as McpPlan & { error?: string };
  if (!response.ok) throw new McpHubError(result.error ?? 'MCP接続枠を確認できません。', 'mcp_plan_required');
  window.dispatchEvent(new Event('sky-mcp-plan'));
  return result;
}

export async function connectMcp(serverId: string, name = serverId) {
  await planRequest('POST', { connectionKey: await mcpConnectionKey(serverId), name });
  // Keep the reservation on ambiguous network failure. Retry is idempotent;
  // confirmed disconnect releases it, so an unknown live server cannot free a slot.
  const data = await connector<{ passport: McpConnectionPassport }>(
    `/servers/${encodeURIComponent(serverId)}/connect`,
    { method: 'POST', body: '{}' },
  );
  return data.passport;
}

export async function disconnectMcp(serverId: string) {
  const result = await connector<{ id: string; state: 'available' }>(
    `/servers/${encodeURIComponent(serverId)}/disconnect`,
    { method: 'POST', body: '{}' },
  );
  await planRequest('DELETE', { connectionKey: await mcpConnectionKey(serverId) });
  return result;
}

async function requireMcpSlot(serverId: string) {
  const connectionKey = await mcpConnectionKey(serverId);
  const plan = await planRequest('GET');
  if (!plan.connections.some((slot: { connectionKey: string }) => slot.connectionKey === connectionKey))
    throw new McpHubError('MCP接続枠を確保するため、Skyで接続し直してください。', 'mcp_plan_required');
}

export async function prepareMcpTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
) {
  await requireMcpSlot(serverId);
  return connector<McpApproval>(
    `/servers/${encodeURIComponent(serverId)}/prepare`,
    {
      method: 'POST',
      body: JSON.stringify({ name, arguments: args }),
    },
  );
}

export async function executeApprovedMcpTool<T = unknown>(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
  approvalToken: string,
) {
  await requireMcpSlot(serverId);
  const data = await connector<{ result: T }>(
    `/servers/${encodeURIComponent(serverId)}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        arguments: args,
        approvalToken,
        confirmed: true,
      }),
    },
  );
  return data.result;
}
