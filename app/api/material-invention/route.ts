import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';
import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { WorkError, workId } from '@/lib/workflow';
import { MaterialInventionError } from '@/lib/material-invention';
import { createMaterialStudy, restoreMaterialStudy, sameMaterialStudy, MATERIAL_STUDY_MAX_BYTES } from '@/lib/material-study';

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
function failure(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  if (error instanceof WorkError) return json({ error: error.message }, error.status);
  if (error instanceof MaterialInventionError) return json({ error: error.message }, 400);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '保存・再開にはサインインが必要です。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError) return json({ error: 'JSONの形式を確認してください。' }, 400);
  return json({ error: '保存状態を確認できません。入力を保持し、同じ操作を再試行してください。' }, 503);
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MATERIAL_STUDY_MAX_BYTES) {
      await reader.cancel();
      throw new WorkError('入力は48 KB以内にしてください。', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new WorkError('UTF-8のJSONを入力してください。'); }
  return JSON.parse(text) as unknown;
}
export async function GET(request: Request) {
  try {
    const user = await requestUser(request), store = workStore(database());
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return json({ jobs: await store.listMaterial(user), ownerScope: await ownerScopeFor(user) });
    const job = await store.get(user, workId(id));
    if (!job || job.templateId !== 'material-invention') throw new WorkError('物質候補が見つかりません。', 404);
    return json({ job, graph: await restoreMaterialStudy(job) });
  } catch (error) { return failure(request, error); }
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request), db = database();
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    if (!(await rockstarServiceScopeAllowed(db, user, 'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request))) {
      if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
      return missingRockstarServiceScope('Zema');
    }
    const { job: candidate } = await createMaterialStudy(await body(request));
    const saved = await workStore(db).create(user, candidate);
    if (!saved || !sameMaterialStudy(saved, candidate)) throw new WorkError('同じ保存IDに異なる入力は保存できません。', 409);
    return json({ job: saved, graph: await restoreMaterialStudy(saved) }, 201);
  } catch (error) { return failure(request, error); }
}
