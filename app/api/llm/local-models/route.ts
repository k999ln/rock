import { readOllamaModelInventory } from '@/lib/ollama-model-inventory';
import { env } from 'cloudflare:workers';
import { requestUser } from '@/lib/fund-store';
import { configuredLocalDevelopmentUser } from '@/lib/request-auth';
import { skyPrivateLabAllowed } from '@/lib/sky-app-contract';
import { json } from '@/lib/operations-api';
/** Read-only installed model discovery for the owner's private localhost preview. */
export async function GET(request: Request) {
  const localPreview = configuredLocalDevelopmentUser(request, (env as unknown as { ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID?: string }).ROCKSTAR_LOCAL_DEVELOPMENT_USER_ID);
  if (!localPreview && !skyPrivateLabAllowed(process.env.NODE_ENV, new URL(request.url).host)) return json({ error: 'この環境では端末モデル一覧を公開していません。' },404);
  try {
    await requestUser(request);
    const models = await readOllamaModelInventory(env as unknown as import('@/lib/llm-providers').LlmRuntimeEnv);
    return json({provider:'ollama',models,inferenceStarted:false});
  }catch(error){if(error instanceof Error&&error.message==='UNAUTHORIZED')return json({error:'サインインして確認してください。'},401);return json({error:'端末のOllamaに接続できません。起動状態を確認してください。'},503);}
}
