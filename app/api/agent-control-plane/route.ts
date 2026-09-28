import { env } from 'cloudflare:workers';
import {
  AgentControlPlane,
  CursorCloudAgentClient,
  JevAgentStrategyProvider,
  validateAgentTaskInput,
} from '@/lib/agent-control-plane';
import { database } from '@/lib/fund-store';
import {
  authorizeRemoteAiRequest,
  RemoteAiGuardError,
} from '@/lib/remote-ai-guard';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function allowedRepositories(value?: string): Set<string> {
  const configured = value
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return new Set(
    configured && configured.length > 0
      ? configured
      : ['https://github.com/k999ln/rock'],
  );
}

export async function POST(request: Request) {
  try {
    const userId = await authorizeRemoteAiRequest(
      request,
      'agent-control-plane',
      database(),
    );
    const raw = await request.text();
    if (raw.length > 16_000) throw new Error('INVALID_INPUT');
    const body = JSON.parse(raw) as {
      task?: unknown;
      dryRun?: boolean;
    };
    const task = validateAgentTaskInput(body.task);
    const runtimeEnv = env as unknown as {
      AGENT_CONTROL_PLANE_ENABLED?: string;
      AGENT_REPOSITORY_ALLOWLIST?: string;
      CURSOR_API_KEY?: string;
      AI_GATEWAY_API_KEY?: string;
      SKY_REMOTE_LLM_ENABLED?: string;
    };

    if (runtimeEnv.AGENT_CONTROL_PLANE_ENABLED !== 'true')
      return Response.json(
        { error: 'Agent Control Plane is disabled.', code: 'disabled' },
        { status: 503, headers: noStoreHeaders },
      );

    if (
      !allowedRepositories(runtimeEnv.AGENT_REPOSITORY_ALLOWLIST).has(
        task.repositoryUrl,
      )
    )
      return Response.json(
        {
          error: 'Repository is not in the agent execution allowlist.',
          code: 'repository_not_allowed',
        },
        { status: 403, headers: noStoreHeaders },
      );

    const decisionProvider =
      runtimeEnv.SKY_REMOTE_LLM_ENABLED === 'true' &&
      runtimeEnv.AI_GATEWAY_API_KEY
        ? new JevAgentStrategyProvider(runtimeEnv.AI_GATEWAY_API_KEY)
        : undefined;
    const cursorClient = runtimeEnv.CURSOR_API_KEY
      ? new CursorCloudAgentClient(runtimeEnv.CURSOR_API_KEY)
      : undefined;
    const control = new AgentControlPlane({
      decisionProvider,
      cursorClient,
    });
    const receipt =
      body.dryRun === true
        ? await control.plan(task)
        : await control.launch(task);

    return Response.json(
      {
        ...receipt,
        requestedBy: userId,
      },
      {
        status:
          receipt.status === 'blocked'
            ? 409
            : receipt.status === 'unavailable'
              ? 503
              : 200,
        headers: noStoreHeaders,
      },
    );
  } catch (error) {
    if (error instanceof RemoteAiGuardError)
      return Response.json(
        { error: error.code, code: error.code },
        { status: error.status, headers: noStoreHeaders },
      );

    console.error(
      'agent control plane failed',
      error instanceof Error ? error.message : 'unknown',
    );
    return Response.json(
      { error: 'Invalid or unavailable agent-control request.', code: 'invalid' },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
