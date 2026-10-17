import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { createWorkJob, updateComposedWork, workId, objectInput, WorkError } from '@/lib/workflow';
import { CompositionError, COMPOSITION_TEXT_LIMIT, runnableCompositionNodes } from '@/lib/work-composition';
import { executeCompositionNode } from '@/lib/work-composition-executor';

export const runtime = 'nodejs';
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function read(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 80_000) { await reader.cancel(); throw new WorkError('入力は80 KB以内にしてください。', 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const db = database();
    const input = objectInput(await read(request), ['action', 'jobId', 'revision', 'commandId', 'plan', 'source', 'stepId', 'saveMaterial']);
    const store = workStore(db);
    if (input.action !== 'clear' && !(await rockstarServiceScopeAllowed(db, user, 'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED, env, request))) return missingRockstarServiceScope('Zema');
    if (input.action === 'create') {
      const candidate = createWorkJob({ id: input.jobId, title: '目的から組み立てる仕事', templateId: 'composition', plan: input.plan });
      const saved = await store.create(user, candidate);
      if (!saved || saved.templateId !== 'composition' || JSON.stringify(saved.composition?.plan) !== JSON.stringify(candidate.composition?.plan)) throw new WorkError('仕事IDが使用されています。', 409);
      return json({ job: saved }, 201);
    }
    const current = await store.get(user, workId(input.jobId));
    if (!current?.composition) throw new WorkError('仕事が見つかりません。', 404);
    if (!['revise', 'run', 'clear'].includes(String(input.action))) throw new WorkError('操作を確認してください。');
    const id = workId(input.commandId);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(input)));
    const fingerprint = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const duplicate = current.composition.operations.find((op) => op.id === id);
    if (duplicate) {
      if (duplicate.fingerprint !== fingerprint) throw new WorkError('同じ操作IDの内容が異なります。', 409);
      return json({ job: current });
    }
    if (!Number.isInteger(input.revision) || input.revision !== current.revision) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
    const base = { id, fingerprint, revision: input.revision as number };
    let next;
    if (input.action === 'revise') next = updateComposedWork(current, { ...base, action: 'revise', plan: input.plan });
    else if (input.action === 'clear') next = updateComposedWork(current, { ...base, action: 'clear' });
    else {
      if (input.saveMaterial !== true) throw new WorkError('本人用の素材・成果保存に同意してください。');
      const node = runnableCompositionNodes(current.composition).find((n) => n.id === input.stepId);
      if (!node || current.status !== 'active') throw new WorkError('入力元または処理の接続条件を確認してください。', 409);
      if (current.composition.plan.deadline && current.composition.plan.deadline < new Date().toISOString().slice(0, 10))
        throw new WorkError('期限を過ぎています。計画を確認して期限を変更してください。', 409);
      const source = current.composition.source ?? input.source;
      if (typeof source !== 'string' || !source.trim() || source.length > COMPOSITION_TEXT_LIMIT) throw new WorkError('素材は1〜12000文字で入力してください。');
      let result;
      try { result = await executeCompositionNode(current.composition, node, source); }
      catch (error) {
        if (error instanceof CompositionError) throw error;
        // Known adapters can include manuscript fragments in errors: never echo raw exceptions.
        throw new WorkError('入力または処理設定が条件に合いません。設定を見直して再実行してください。');
      }
      next = updateComposedWork(current, { ...base, action: 'run', stepId: node.id, source, result });
    }
    if (next !== current && !(await store.update(user, next, current.revision))) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
    return json({ job: next });
  } catch (error) {
    if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
    if (error instanceof WorkError || error instanceof CompositionError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'サインインすると仕事を保存・実行できます。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
    if (error instanceof SyntaxError) return json({ error: '入力の形式を確認してください。' }, 400);
    return json({ error: '仕事を保存できません。再読込して状態を確認してください。' }, 503);
  }
}
