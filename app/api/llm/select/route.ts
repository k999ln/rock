import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { authorizeRemoteAiRequest, RemoteAiGuardError } from '@/lib/remote-ai-guard';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { chooseSkyModel, discoverSkyLocalModels } from '@/lib/sky-model-routing';
import { isLoopbackLlmEndpoint, type LlmRuntimeEnv } from '@/lib/llm-providers';

export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const db = database();
    const owner = await authorizeRemoteAiRequest(request, 'llm-select', db);
    const runtime = env as unknown as LlmRuntimeEnv & { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string };
    if (!(await rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request)))
      return missingRockstarServiceScope('RockstarOS');
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 28000) return Response.json({ error: '依頼が長すぎます。' }, { status: 413, headers });
    const value = JSON.parse(raw) as { prompt?: unknown; baseUrl?: unknown };
    if (typeof value.prompt !== 'string' || !value.prompt.trim() || value.prompt.length > 24000 ||
      (value.baseUrl !== undefined && (typeof value.baseUrl !== 'string' || !isLoopbackLlmEndpoint(value.baseUrl))))
      return Response.json({ error: '依頼・接続先を確認してください。' }, { status: 400, headers });
    const candidates = await discoverSkyLocalModels({ ...runtime,
      ...(typeof value.baseUrl === 'string' ? { SKY_LOCAL_LLM_BASE_URL: value.baseUrl } : {}),
    });
    const selection = chooseSkyModel(value.prompt, candidates);
    return Response.json(selection ? { selection } : {
      error: '自動選択できるモデルがありません。ローカルLLMを接続するか、手動で接続先を選んでください。Cloudの無料利用権は未確認です。',
    }, { status: selection ? 200 : 409, headers });
  } catch (error) {
    return Response.json({ error: error instanceof RemoteAiGuardError ? 'サインイン・操作権限を確認してください。' : 'モデル接続を確認できませんでした。' }, {
      status: error instanceof RemoteAiGuardError ? error.status : 400, headers,
    });
  }
}
