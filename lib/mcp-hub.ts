import type { WorkToolApprovalContext } from './workflow.ts';
import { DEVICE_URL, deviceToken } from '@/lib/device';

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
  observationId?: string;
  observedAt?: number;
  observationExpiresAt?: number;
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
  executionContext?: WorkToolApprovalContext;
  expiresAt: string;
  server: string;
  tool: string;
  toolId: string;
  summary: string;
  pricing: McpToolPassport['pricing'] & { declaration: 'provider_unverified' };
  approvalRequired: true;
};

/** Ephemeral one-use authority for a particular saved job attempt. */
export type McpJobGate = { jobId: string; attemptId: string; agentId: string; agentRevision: number; ownerScope: string; token: string; executionReviewDigest?: string };
export type McpJobClaim = { jobId: string; attemptId: string; inputSha256: string; jobRevision: number; executionReviewDigest?: string };

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

export async function connectMcp(serverId: string) {
  const data = await connector<{ passport: McpConnectionPassport }>(
    `/servers/${encodeURIComponent(serverId)}/connect`,
    { method: 'POST', body: '{}' },
  );
  return data.passport;
}

export async function refreshMcpObservation(serverId: string) {
  const data = await connector<{ passport: McpConnectionPassport }>(
    `/servers/${encodeURIComponent(serverId)}/refresh`, { method: 'POST', body: '{}' },
  );
  return data.passport;
}

export async function disconnectMcp(serverId: string) {
  return connector<{ id: string; state: 'available' }>(
    `/servers/${encodeURIComponent(serverId)}/disconnect`,
    { method: 'POST', body: '{}' },
  );
}

export async function prepareMcpTool(
  serverId: string,
  name: string,
  args: Record<string, unknown>,
) {
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
  jobGate?: McpJobGate,
  onJobClaim?: (claim: McpJobClaim) => void,
) {
  const data = await connector<{ result: T; jobClaim?: McpJobClaim }>(
    `/servers/${encodeURIComponent(serverId)}/execute`,
    {
      method: 'POST',
      body: JSON.stringify({
        name,
        arguments: args,
        approvalToken,
        confirmed: true,
        ...(jobGate ? { jobGate } : {}),
      }),
    },
  );
  if (jobGate) {
    const claim = data.jobClaim;
    if (!claim || claim.jobId !== jobGate.jobId || claim.attemptId !== jobGate.attemptId ||
        !/^[a-f0-9]{64}$/.test(claim.inputSha256) || !Number.isSafeInteger(claim.jobRevision) ||
        (jobGate.executionReviewDigest !== undefined && claim.executionReviewDigest !== jobGate.executionReviewDigest))
      throw new McpHubError('仕事の実行状態を確認できません。再送せず照合してください。', 'job_claim_unknown');
    onJobClaim?.(claim);
  }
  return data.result;
}
