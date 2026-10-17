import { database, requestUser } from '@/lib/fund-store';
import { body } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { mcpPlanStore, McpPlanError } from '@/lib/sky-mcp-plan';

const headers = { 'Cache-Control': 'no-store' };
async function handle(request: Request) {
  try {
    const user = await requestUser(request);
    const store = mcpPlanStore(database(), user);
    if (request.method === 'GET')
      return Response.json(await store.read(), { headers });
    const input = (await body(request)) as Record<string, unknown>;
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).some(
        (key) => !['connectionKey', 'name'].includes(key),
      ) ||
      typeof input.connectionKey !== 'string'
    )
      throw new McpPlanError('接続先を確認してください。');
    const result =
      request.method === 'DELETE'
        ? await store.release(input.connectionKey)
        : await store.reserve(input.connectionKey, input.name as string);
    return Response.json(result, { headers });
  } catch (error) {
    const status =
      error instanceof McpPlanError || error instanceof OperationError
        ? error.status
        : error instanceof Error && error.message === 'UNAUTHORIZED'
          ? 401
          : error instanceof Error && error.message === 'ORIGIN'
            ? 403
            : 503;
    return Response.json(
      {
        error:
          status === 401
            ? 'Sign in to manage your MCP connections.'
            : status === 403
              ? 'このSky画面から操作してください。'
              : error instanceof McpPlanError || error instanceof OperationError
                ? error.message
                : '接続枠を確認できません。時間を置いて再試行してください。',
      },
      { status, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
