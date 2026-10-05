import {
  a2aAgentDirectory,
  A2AAgentDirectoryError,
  discoverA2AAgent,
} from '@/lib/a2a-agent-directory';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { a2aEgressOriginAllowed } from '@/lib/a2a-authorization';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { env } from 'cloudflare:workers';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readOrigin(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 2_000) {
      await reader.cancel();
      throw new Error('BODY_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('INVALID_BODY');
  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.origin !== 'string')
    throw new Error('INVALID_BODY');
  return input.origin;
}

function errorResponse(error: unknown) {
  if (error instanceof A2AAgentDirectoryError)
    return json({ error: error.message, code: error.code }, error.status);
  if (error instanceof RemoteAiGuardError)
    return json(
      { error: error.code === 'RATE_LIMITED' ? 'Agent Card取得の回数上限に達しました。' : '認証を確認してください。' },
      error.status,
    );
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE')
    return json({ error: 'originの入力が大きすぎます。' }, 413);
  if (error instanceof SyntaxError || (error instanceof Error && error.message === 'INVALID_BODY'))
    return json({ error: 'HTTPS originを確認してください。' }, 400);
  return json({ error: 'Agent Cardを登録できませんでした。' }, 503);
}

export async function GET(request: Request) {
  try {
    const db = database();
    const owner = await requestRockstarUser(request, db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'sky',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) return missingRockstarServiceScope('Sky');
    return json({ agents: await a2aAgentDirectory(db).list(owner) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'sky-a2a-agent-discovery', db);
    if (!(await rockstarServiceScopeAllowed(
      db,
      owner,
      'sky',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
    ))) return missingRockstarServiceScope('Sky');
    const origin = await readOrigin(request);
    const allowedOrigins = (env as unknown as { A2A_EGRESS_ALLOWED_ORIGINS?: string })
      .A2A_EGRESS_ALLOWED_ORIGINS;
    if (!a2aEgressOriginAllowed(origin, allowedOrigins))
      return json(
        { error: 'この接続先は運営側の外部接続許可リストにありません。' },
        403,
      );
    const discovered = await discoverA2AAgent(origin);
    const agent = await a2aAgentDirectory(db).upsert(owner, discovered);
    return json({ agent, trust: 'self_declared_unreviewed' }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
