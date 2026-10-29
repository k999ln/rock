import { readBoundedStream } from '@/lib/bounded-stream';
import { ownerScopeFor, rejectChangedOwner } from '@/lib/owner-intent';
import { env } from 'cloudflare:workers';
import { a2aDelegationStore } from '@/lib/a2a-delegation-store';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { skyAgentLibraryStore } from '@/lib/sky-agent-library-store';
import { missingRockstarServiceScope, rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import {
  createWorkJob,
  parseWorkAgentCreationReview,
  workAgentCreationRequestDigest,
  applyWorkCommand,
  objectInput,
  parseWorkCommand,
  type WorkCommand,
  workId,
  WorkError,
} from '@/lib/workflow';

function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
function failure(error: unknown) {
  if (error instanceof WorkError)
    return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED')
    return json({ error: 'サインインすると仕事を保存できます。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN')
    return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError)
    return json({ error: '入力の形式を確認してください。' }, 400);
  return json(
    { error: '仕事を保存できませんでした。再試行してください。' },
    503,
  );
}
function rejected(request: Request, error: unknown) {
  // Release an unread body after an early auth/Origin rejection. Do not buffer
  // untrusted input or wait for it before replying, and never cancel a reader
  // already owned by the bounded parser.
  if (request.body && !request.bodyUsed && !request.body.locked)
    void request.body.cancel().catch(() => {});
  return failure(error);
}
async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const bytes = await readBoundedStream(reader, 12000, () =>
    new WorkError('入力は12 KB以下にしてください。', 413),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export async function GET(request: Request) {
  try {
    const user = await requestUser(request);
    const id = new URL(request.url).searchParams.get('id');
    const store = workStore(database());
    const exact = id === null ? null : await store.get(user, workId(id));
    return json({ jobs: id === null ? await store.list(user, true) : exact ? [exact] : [], ownerScope: await ownerScopeFor(user) });
  } catch (error) {
    return rejected(request, error);
  }
}
function agentReference(value: unknown) {
  const input = objectInput(value, ['id', 'revision']);
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,119}$/.test(input.id) ||
      !Number.isSafeInteger(input.revision) || Number(input.revision) < 1)
    throw new WorkError('保存した担当と版を確認してください。');
  return { id: input.id, revision: input.revision as number };
}
async function requestDigest(value: unknown) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const db = database();
    if (!(await rockstarServiceScopeAllowed(
      db,
      user,
      'zema',
      (env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string }).ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED,
      env, request,
    ))) {
      if (request.body && !request.bodyUsed && !request.body.locked)
        void request.body.cancel().catch(() => {});
      return missingRockstarServiceScope('Zema');
    }
    const raw = await body(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new WorkError('入力項目を確認してください。');
    const { agentRef: reference, creationReview: reviewInput, creationInput, creationReviewExpiresAt, ...workInput } = raw as Record<string, unknown>;
    const hasReview = Object.hasOwn(raw, 'creationReview');
    if (hasReview !== Object.hasOwn(raw, 'creationInput') || hasReview !== Object.hasOwn(raw, 'creationReviewExpiresAt')) throw new WorkError('作成前確認と入力を確認してください。');
    const hasReference = Object.hasOwn(raw, 'agentRef');
    const ref = hasReference ? agentReference(reference) : null;
    const creationReview = hasReview ? parseWorkAgentCreationReview(reviewInput) : undefined;
    if (creationReview && (!ref || creationReview.ownerScope !== await ownerScopeFor(user) ||
        creationReview.agentId !== ref.id || creationReview.agentRevision !== ref.revision ||
        !creationInput || typeof creationInput !== 'object' || Array.isArray(creationInput) ||
        await requestDigest(creationInput) !== creationReview.inputSha256))
      throw new WorkError('作成前確認の本人・担当・入力が変わりました。', 409);
    if (hasReview && (!Number.isSafeInteger(creationReviewExpiresAt) || Number(creationReviewExpiresAt) < 1))
      throw new WorkError('作成前確認の有効期限を確認してください。');
    const candidate = createWorkJob(workInput);
    if (ref) candidate.agentBinding = {
      schema: 'rockstaros.work-agent-binding/1', agentId: ref.id, agentRevision: ref.revision,
      requestDigest: await workAgentCreationRequestDigest(candidate, ref, creationReview),
      ...(creationReview ? { creationReview } : {}),
    };
    if (candidate.templateId === 'sky-citation-agent') throw new WorkError('Skyの出典整理Agent画面から実行してください。');
    if (candidate.templateId === 'amc') throw new WorkError('AMC画面から計画を保存してください。');
    if (candidate.templateId === 'material-invention') throw new WorkError('物質候補の専用画面から入力を保存してください。');
    if (candidate.templateId === 'composition') throw new WorkError('仕事を組み立てる画面から計画を保存してください。');
    const store = workStore(db);
    const sameBinding = (existing: typeof candidate | null) => !candidate.agentBinding ? !existing?.agentBinding :
      (existing?.agentBinding?.schema === candidate.agentBinding.schema &&
        existing.agentBinding.agentId === candidate.agentBinding.agentId &&
        existing.agentBinding.agentRevision === candidate.agentBinding.agentRevision &&
        existing.agentBinding.requestDigest === candidate.agentBinding.requestDigest);
    // A lost create response is reconciled by the same owner, ID and immutable intent.
    // This is a readback of the old snapshot, not a fresh execution authorization.
    let reviewedManifest: string | undefined;
    if (candidate.agentBinding) {
      const existing = await store.get(user, candidate.id);
      if (existing) {
        if (!sameBinding(existing)) throw new WorkError('仕事IDが別の依頼に使われています。', 409);
        return json({ job: existing, created: false });
      }
      const agent = await skyAgentLibraryStore(db, user).get(candidate.agentBinding.agentId);
      if (!agent || !agent.enabled || agent.revision !== candidate.agentBinding.agentRevision)
        throw new WorkError('本人の担当と最新の版を確認してください。', 409);
      if (creationReview) {
        const remaining = Number(creationReviewExpiresAt) - Date.now();
        if (remaining <= 0 || remaining > 30_000) throw new WorkError('作成前確認の期限が切れました。確認をやり直してください。', 409);
        if (agent.requirements?.packageKey !== creationReview.packageKey || agent.requirements.executionTarget !== 'pc')
          throw new WorkError('担当のToolと実行先を確認してください。', 409);
        const row = await db.prepare(`SELECT p.manifest FROM sky_tool_packages p
          WHERE p.package_key = ? AND p.manifest_sha256 = ? AND p.status = 'verified'
          AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r WHERE r.package_key = p.package_key
            AND r.manifest_sha256 = p.manifest_sha256 AND r.decision = 'verified'
            AND (r.expires_at IS NULL OR r.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)))`)
          .bind(creationReview.packageKey, creationReview.manifestSha256).first<{ manifest: string }>();
        if (!row) throw new WorkError('Toolの版または審査状態が変わりました。', 409);
        const manifest = JSON.parse(row.manifest);
        if (manifest.pricing?.model !== 'free' || manifest.pricing.note !== creationReview.pricing.packageNote ||
            !manifest.capabilities?.executionTargets?.includes('pc') ||
            !((manifest.adapter?.connectionType === 'mcp_stdio' && creationReview.transport === 'stdio') ||
              (manifest.adapter?.connectionType === 'mcp_streamable_http' && creationReview.transport === 'local_http')))
          throw new WorkError('Toolの実行先と料金申告を確認してください。', 409);
        reviewedManifest = row.manifest;
      }
    }
    const existingJennifer = candidate.coordination
      ? await store.findJenniferTaskJob(user, candidate.coordination)
      : null;
    if (existingJennifer) {
      if (!sameBinding(existingJennifer)) throw new WorkError('既存の仕事と担当が一致しません。', 409);
      return json({ job: existingJennifer, created: false });
    }
    let saved = null;
    try { saved = candidate.agentBinding ? await store.createAgentBound(user, candidate, reviewedManifest, creationReviewExpiresAt as number | undefined) : await store.create(user, candidate); }
    catch (error) {
      if (!candidate.coordination) throw error;
    }
    const recoveredJennifer = !saved && candidate.coordination
      ? await store.findJenniferTaskJob(user, candidate.coordination)
      : null;
    const result = saved ?? recoveredJennifer;
    const sameJenniferCoordination = !candidate.coordination || (
      result?.coordination?.schema === candidate.coordination.schema &&
      result.coordination.rootJobId === candidate.coordination.rootJobId &&
      result.coordination.planId === candidate.coordination.planId &&
      result.coordination.taskId === candidate.coordination.taskId &&
      result.coordination.role === candidate.coordination.role
    );
    if (
      !result ||
      result.title !== candidate.title ||
      result.templateId !== candidate.templateId ||
      !sameBinding(result) ||
      !sameJenniferCoordination
    )
      throw new WorkError('仕事IDが使用されています。', 409);
    return json({ job: result, created: result.id === candidate.id }, result.id === candidate.id ? 201 : 200);
  } catch (error) {
    return rejected(request, error);
  }
}
/** A cancellation prepared before a single intervening claim stays a stop
 * request. Other revision conflicts must still be resolved by the caller. */
function cancellationMayFollowClaim(job: import('@/lib/workflow').WorkJob, requestedRevision: unknown) {
  return Number.isSafeInteger(requestedRevision) && Number(requestedRevision) + 1 === job.revision &&
    job.toolAttempts?.length === 1 && job.toolAttempts[0].state === 'claimed' &&
    job.toolAttempts[0].claimedRevision === job.revision;
}
export async function PATCH(request: Request) {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    const input = objectInput(await body(request), [
      'jobId',
      'revision',
      'command',
    ]);
    const store = workStore(database()),
      current = await store.get(user, workId(input.jobId));
    if (!current) throw new WorkError('仕事が見つかりません。', 404);
    if (current.templateId === 'sky-citation-agent') throw new WorkError('このAgentの完了記録は専用APIで管理します。', 409);
    if (current.templateId === 'amc' || current.amcGoal)
      throw new WorkError('AMC画面から記録を更新してください。');
    const command = parseWorkCommand(input.command);
    // Cancelling this local plan must remain possible when historical evidence is unavailable.
    // This does not send a remote cancellation or permit any progress/completion.
    if (current.templateId === 'cloud-agent' && command.action !== 'cancel') {
      const reviewCommands = [
        ...current.events.map(({ command: event }) => event),
        command,
      ].filter((event): event is Extract<WorkCommand, { action: 'record' }> => event.action === 'record');
      const delegations = a2aDelegationStore(database());
      for (const event of reviewCommands) {
        if (!event.delegationId)
          throw new WorkError('親jobのAgent手順に委任IDがありません。再読込して状態を確認してください。', 409);
        const delegation = await delegations.get(user, event.delegationId);
        if (!delegation || delegation.parentJobId !== current.id)
          throw new WorkError('記録するAgent委任がこの親jobに属していません。', 409);
        if (event.stepId === 'agent-brief') {
          if (!delegation.priceQuote || !/^[a-f0-9]{64}$/i.test(delegation.priceQuoteDigest))
            throw new WorkError('Agentの署名付き見積が保存されていないため、計画手順を通過できません。', 409);
        } else if (event.stepId === 'agent-result') {
          const [artifacts, receipt] = await Promise.all([
            delegations.listArtifacts(user, delegation.id),
            delegations.getUsageReceipt(user, delegation.id),
          ]);
          if (delegation.state !== 'remote_completed' || delegation.artifactsCaptured !== 1 ||
            artifacts.length === 0 || !receipt || receipt.parentJobId !== current.id)
            throw new WorkError('Agentの完了状態・保存成果・利用receiptを確認できないため、計画を進められません。', 409);
        } else {
          throw new WorkError('Cloud Agent計画の手順が不正です。', 409);
        }
      }
    }
    const effectiveRevision = command.action === 'cancel' && cancellationMayFollowClaim(current, input.revision)
      ? current.revision : input.revision;
    const next = applyWorkCommand(current, command, effectiveRevision);
    if (next !== current && !(await store.update(user, next, current.revision))) {
      if (command.action === 'cancel') {
        const latest = await store.get(user, current.id);
        if (latest && cancellationMayFollowClaim(latest, input.revision)) {
          const requested = applyWorkCommand(latest, command, latest.revision);
          if (requested === latest || await store.update(user, requested, latest.revision)) return json({ job: requested });
        }
      }
      throw new WorkError(
        '別の操作で更新されています。一覧を再読込してください。',
        409,
      );
    }
    return json({ job: next });
  } catch (error) {
    return rejected(request, error);
  }
}
