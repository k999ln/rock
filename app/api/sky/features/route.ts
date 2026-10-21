import { database, requestUser } from '@/lib/fund-store';
import { body, json } from '@/lib/operations-api';
import { OperationError } from '@/lib/operations';
import { SkyFeatureError, skyFeatureStore } from '@/lib/sky-feature-additions';
function failure(error: unknown) {
  if (error instanceof SkyFeatureError || error instanceof OperationError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインして自分の機能を追加してください。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
  return json({ error: '追加した機能を確認できません。再読み込みしてください。' }, 503);
}
export async function GET(request: Request) {
  try { return json({ features: await skyFeatureStore(database(), await requestUser(request)).list() }); }
  catch (error) { return failure(error); }
}
export async function PUT(request: Request) {
  try {
    if (request.headers.get('origin') !== new URL(request.url).origin) throw new Error('ORIGIN');
    const owner = await requestUser(request);
    return json({ features: await skyFeatureStore(database(), owner).save(await body(request)) });
  } catch (error) { return failure(error); }
}
