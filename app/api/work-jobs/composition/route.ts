import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { workCompositionStore } from '@/lib/work-composition-store';
import {
  missingRockstarServiceScope,
  rockstarServiceScopeAllowed,
} from '@/lib/rockstar-service-access';
import {
  createWorkJob,
  normalizeWorkJob,
  updateComposedWork,
  workId,
  objectInput,
  WorkError,
} from '@/lib/workflow';
import {
  CompositionError,
  compositionPayloadFingerprint,
  COMPOSITION_TEXT_LIMIT,
  parseCompositionPlan,
  runnableCompositionNodes,
} from '@/lib/work-composition';
import { executeCompositionNode } from '@/lib/work-composition-executor';
import { readBoundedStream } from '@/lib/bounded-stream';
import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';

export const runtime = 'nodejs';
function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const bytes = await readBoundedStream(
    reader,
    80_000,
    () => new WorkError('入力は80 KB以内にしてください。', 413),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
function failure(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  if (error instanceof WorkError || error instanceof CompositionError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると仕事を保存・実行できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    { error: '仕事を保存できません。再読込して状態を確認してください。' },
    503,
  );
}
export async function GET(request: Request) {
  try {
    const user = await requestUser(request),
      db = database(),
      ownerScope = await ownerScopeFor(user);
    const id = new URL(request.url).searchParams.get('jobId');
    if (id !== null) {
      const job = await workStore(db).get(user, workId(id));
      if (!job?.composition) throw new WorkError('仕事が見つかりません。', 404);
      return json({ job, ownerScope });
    }
    return json({
      recipes: await workCompositionStore(db).recipes(user),
      ownerScope,
    });
  } catch (error) {
    return failure(request, error);
  }
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const db = database(),
      store = workStore(db);
    const input = objectInput(await body(request), [
      'action',
      'jobId',
      'revision',
      'commandId',
      'plan',
      'source',
      'stepId',
      'saveMaterial',
      'name',
      'recipeJobId',
      'recipeRevision',
    ]);
    // Erasure remains possible even when service access has expired.
    if (
      !['clear', 'delete_recipe'].includes(String(input.action)) &&
      !(await rockstarServiceScopeAllowed(
        db,
        user,
        'zema',
        (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string })
          .ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
        env,
        request,
      ))
    )
      return missingRockstarServiceScope('Zema');
    const ownerScope = await ownerScopeFor(user),
      digest = await compositionPayloadFingerprint(input);
    if (['create', 'reuse_recipe'].includes(String(input.action))) {
      objectInput(
        input,
        input.action === 'create'
          ? ['action', 'jobId', 'plan']
          : ['action', 'recipeJobId', 'recipeRevision', 'jobId', 'plan'],
      );
      const existing = await store.get(user, workId(input.jobId));
      if (existing) {
        if (existing.composition?.creationFingerprint !== digest)
          throw new WorkError('仕事IDが使用されています。', 409);
        return json({ job: existing, ownerScope }, 201);
      }
      const parsedPlan = parseCompositionPlan(input.plan);
      const candidate = createWorkJob({
        id: input.jobId,
        title: parsedPlan.objective.slice(0, 120),
        templateId: 'composition',
        plan: parsedPlan,
      });
      candidate.composition!.creationFingerprint = digest;
      if (input.action === 'reuse_recipe') {
        const recipeJob = await store.get(user, workId(input.recipeJobId));
        if (!recipeJob?.composition?.recipe)
          throw new WorkError('レシピが見つかりません。', 404);
        if (
          !Number.isInteger(input.recipeRevision) ||
          input.recipeRevision !== recipeJob.revision
        )
          throw new WorkError(
            'レシピが更新されました。再読込してください。',
            409,
          );
        const graph = (p: ReturnType<typeof parseCompositionPlan>) =>
          JSON.stringify({
            inputKind: p.inputKind,
            nodes: p.nodes.map(({ id, tool, inputs }) => ({
              id,
              tool,
              inputs,
            })),
          });
        if (
          graph(candidate.composition!.plan) !==
          graph(recipeJob.composition.recipe.plan)
        )
          throw new WorkError(
            '保存されたレシピの手順が変わっています。新しい計画として作成してください。',
            409,
          );
        if (
          !(await workCompositionStore(db).createFromRecipe(
            user,
            candidate,
            recipeJob.id,
            recipeJob.revision,
          ))
        ) {
          const winner = await store.get(user, candidate.id);
          if (winner?.composition?.creationFingerprint === digest)
            return json({ job: winner, ownerScope }, 201);
          throw new WorkError(
            'レシピまたは保存先が更新されました。再読込してください。',
            409,
          );
        }
        return json({ job: candidate, ownerScope }, 201);
      }
      const saved = await store.create(user, candidate);
      if (!saved || saved.composition?.creationFingerprint !== digest)
        throw new WorkError('仕事IDが使用されています。', 409);
      return json({ job: saved, ownerScope }, 201);
    }
    const current = await store.get(user, workId(input.jobId));
    if (!current?.composition)
      throw new WorkError('仕事が見つかりません。', 404);
    if (
      !['revise', 'run', 'clear', 'save_recipe', 'delete_recipe'].includes(
        String(input.action),
      )
    )
      throw new WorkError('操作を確認してください。');
    const common = ['action', 'jobId', 'revision', 'commandId'];
    objectInput(input, [
      ...common,
      ...(input.action === 'revise'
        ? ['plan']
        : input.action === 'run'
          ? ['stepId', 'source', 'saveMaterial']
          : input.action === 'save_recipe'
            ? ['name']
            : []),
    ]);
    const id = workId(input.commandId);
    const duplicate = current.composition.operations.find((op) => op.id === id);
    if (duplicate) {
      if (duplicate.fingerprint !== digest)
        throw new WorkError('同じ操作IDの内容が異なります。', 409);
      return json({ job: current, ownerScope });
    }
    if (
      !Number.isInteger(input.revision) ||
      input.revision !== current.revision
    )
      throw new WorkError(
        '別の操作で更新されました。再読込してください。',
        409,
      );
    const base = {
      id,
      fingerprint: digest,
      revision: input.revision as number,
    };
    let next;
    if (input.action === 'revise')
      next = updateComposedWork(current, {
        ...base,
        action: 'revise',
        plan: input.plan,
      });
    else if (input.action === 'clear')
      next = updateComposedWork(current, { ...base, action: 'clear' });
    else if (input.action === 'save_recipe') {
      if (typeof input.name !== 'string')
        throw new WorkError('レシピ名を入力してください。');
      next = updateComposedWork(current, {
        ...base,
        action: 'save_recipe',
        name: input.name,
      });
    } else if (input.action === 'delete_recipe')
      next = updateComposedWork(current, { ...base, action: 'delete_recipe' });
    else {
      if (input.saveMaterial !== true)
        throw new WorkError('本人用の素材・成果保存に同意してください。');
      const node = runnableCompositionNodes(current.composition).find(
        (n) => n.id === input.stepId,
      );
      if (!node || current.status !== 'active')
        throw new WorkError(
          '入力元または処理の接続条件を確認してください。',
          409,
        );
      if (
        current.composition.plan.deadline &&
        current.composition.plan.deadline <
          new Date().toISOString().slice(0, 10)
      )
        throw new WorkError(
          '期限を過ぎています。計画を確認して期限を変更してください。',
          409,
        );
      const source = current.composition.source ?? input.source;
      if (
        typeof source !== 'string' ||
        !source.trim() ||
        source.length > COMPOSITION_TEXT_LIMIT
      )
        throw new WorkError('素材は1〜12000文字で入力してください。');
      if (
        current.composition.source !== null &&
        input.source !== undefined &&
        input.source !== source
      )
        throw new WorkError('素材を変える場合は新しい仕事を作成してください。');
      let result;
      try {
        result = await executeCompositionNode(
          current.composition,
          node,
          source,
        );
      } catch (error) {
        if (error instanceof CompositionError) throw error;
        // Adapters can include manuscript fragments in errors: never echo raw exceptions.
        throw new WorkError(
          '入力または処理設定が条件に合いません。設定を見直して再実行してください。',
        );
      }
      next = updateComposedWork(current, {
        ...base,
        action: 'run',
        stepId: node.id,
        source,
        result,
      });
    }
    normalizeWorkJob(next);
    if (
      next !== current &&
      !(await store.update(user, next, current.revision))
    ) {
      const winner = await store.get(user, current.id);
      if (
        winner?.composition?.operations.some(
          (op) => op.id === id && op.fingerprint === digest,
        )
      )
        return json({ job: winner, ownerScope });
      throw new WorkError(
        '別の操作で更新されました。再読込してください。',
        409,
      );
    }
    return json({ job: next, ownerScope });
  } catch (error) {
    return failure(request, error);
  }
}
