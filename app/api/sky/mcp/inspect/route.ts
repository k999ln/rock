import { requestUser } from '@/lib/fund-store';
import { inspectRemoteMcp, McpInspectionError } from '@/lib/mcp-inspection';

const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  try {
    requestUser(request);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 1_024)
      throw new McpInspectionError('接続確認の入力が大きすぎます。', 413);
    const input = JSON.parse(raw) as unknown;
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1 ||
      !('endpointUrl' in input)
    )
      throw new McpInspectionError('MCPの接続先URLを確認してください。');
    return Response.json(
      await inspectRemoteMcp((input as { endpointUrl?: unknown }).endpointUrl),
      { headers },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED')
      return Response.json(
        { error: 'サインインするとMCP接続を確認できます。' },
        { status: 401, headers },
      );
    if (error instanceof Error && error.message === 'ORIGIN')
      return Response.json(
        { error: 'このSky画面から確認してください。' },
        { status: 403, headers },
      );
    if (error instanceof McpInspectionError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      { error: 'MCPの接続確認に失敗しました。' },
      { status: 400, headers },
    );
  }
}
