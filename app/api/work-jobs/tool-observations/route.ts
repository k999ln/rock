import { dispatchAuthorityAvailable } from '@/app/api/work-jobs/tool-observations/authority';
import { readBoundedStream } from '@/lib/bounded-stream';
import { OWNER_SCOPE_HEADER, readOwnerScope, rejectChangedOwner } from '@/lib/owner-intent';
import { database, requestUser } from '@/lib/fund-store';
import { workStore } from '@/lib/work-store';
import { newWorkToolCapability, objectInput, workId, workToolCapabilityHash, WorkError, type WorkJob, type WorkToolAttempt, type WorkToolObservation } from '@/lib/workflow';

const MAX_BODY_BYTES = 64_000;
const MAX_TEXT_BYTES = 8_192;
const MAX_TOTAL_TEXT_BYTES = 65_536;
const MAX_ITEMS = 20;
const CAPABILITY_TTL_MS = 60_000;
const encoder = new TextEncoder();
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

function rejected(request: Request, error: unknown) {
  if (request.body && !request.bodyUsed && !request.body.locked) void request.body.cancel().catch(() => {});
  if (error instanceof WorkError) return json({ error: error.message }, error.status);
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: '本人を確認してください。' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'このサイトから操作してください。' }, 403);
  if (error instanceof SyntaxError) return json({ error: '入力の形式を確認してください。' }, 400);
  return json({ error: '状態を保存できませんでした。読み直して確認してください。' }, 503);
}

async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new WorkError('入力がありません。');
  const bytes = await readBoundedStream(reader, MAX_BODY_BYTES, () => new WorkError('入力が長すぎます。', 413));
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new WorkError('入力の形式を確認してください。'); }
}

type AttemptInput = Pick<WorkToolAttempt, 'id' | 'packageKey' | 'manifestSha256' | 'connectorId' | 'toolName' | 'inputSha256'>;
function attempt(value: unknown): AttemptInput {
  const input = objectInput(value, ['id', 'packageKey', 'manifestSha256', 'connectorId', 'toolName', 'inputSha256']);
  const id = workId(input.id);
  if (typeof input.packageKey !== 'string' || input.packageKey.length > 205 ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)+@(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.packageKey) ||
      typeof input.manifestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.manifestSha256) ||
      typeof input.inputSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(input.inputSha256) ||
      typeof input.connectorId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.connectorId) ||
      typeof input.toolName !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(input.toolName))
    throw new WorkError('Tool、接続先と入力の形式を確認してください。');
  return { id, packageKey: input.packageKey, manifestSha256: input.manifestSha256,
    connectorId: input.connectorId, toolName: input.toolName, inputSha256: input.inputSha256 };
}
function sameAttempt(saved: WorkToolAttempt, expected: AttemptInput) {
  return saved.schema === 'rockstaros.work-tool-attempt/1' && saved.id === expected.id &&
    saved.packageKey === expected.packageKey && saved.manifestSha256 === expected.manifestSha256 &&
    saved.connectorId === expected.connectorId && saved.toolName === expected.toolName && saved.inputSha256 === expected.inputSha256;
}
function result(value: unknown) {
  const input = objectInput(value, ['id', 'text']);
  const id = workId(input.id);
  if (typeof input.text !== 'string' || !input.text.length || encoder.encode(input.text).byteLength > MAX_TEXT_BYTES)
    throw new WorkError('成果の形式を確認してください。');
  return { id, text: input.text };
}
function sameObservation(saved: WorkToolObservation, target: WorkToolAttempt, expected: ReturnType<typeof result>) {
  return saved.schema === 'rockstaros.work-tool-observation/1' && saved.verification === 'client_observed_unverified' &&
    saved.id === expected.id && saved.packageKey === target.packageKey && saved.manifestSha256 === target.manifestSha256 &&
    saved.connectorId === target.connectorId && saved.toolName === target.toolName && saved.text === expected.text;
}
function state(job: WorkJob) {
  const binding = job.agentBinding;
  if (!binding || binding.schema !== 'rockstaros.work-agent-binding/1' || !binding.agentId ||
      !Number.isSafeInteger(binding.agentRevision) || binding.agentRevision < 1 || !/^[a-f0-9]{64}$/.test(binding.requestDigest))
    throw new WorkError('同じ本人の担当に結びついた仕事を確認してください。', 409);
  const attempts = job.toolAttempts ?? [], observations = job.toolObservations ?? [];
  if (!Array.isArray(attempts) || !Array.isArray(observations) || attempts.length > MAX_ITEMS || observations.length > MAX_ITEMS ||
      attempts.some(row => !row || row.schema !== 'rockstaros.work-tool-attempt/1' ||
        !['pending', 'claimed', 'cancelled_before_claim', 'stop_requested', 'observed_unverified'].includes(row.state)))
    throw new WorkError('保存済みの実行状態を確認できません。', 409);
  return { binding, attempts, observations };
}

export async function POST(request: Request) {
  try {
    const user = await requestUser(request);
    const mismatch = await rejectChangedOwner(request, user);
    if (mismatch) return mismatch;
    if (!readOwnerScope(request.headers.get(OWNER_SCOPE_HEADER))) throw new WorkError('保存先の本人を読み直してください。', 409);
    const input = objectInput(await body(request), ['action', 'jobId', 'revision', 'attempt', 'attemptId', 'observation']);
    const jobId = workId(input.jobId);
    if (!Number.isSafeInteger(input.revision) || Number(input.revision) < 0) throw new WorkError('仕事の版を確認してください。');
    const db = database(), store = workStore(db), current = await store.get(user, jobId);
    if (!current) throw new WorkError('仕事が見つかりません。', 404);
    const { binding, attempts, observations } = state(current);

    if (input.action === 'begin') {
      if (Object.keys(input).length !== 4 || !Object.hasOwn(input, 'attempt')) throw new WorkError('開始内容を確認してください。');
      const expected = attempt(input.attempt), prior = attempts.find(row => row.id === expected.id);
      if (prior) {
        if (!sameAttempt(prior, expected)) throw new WorkError('同じ実行IDに異なる内容があります。', 409);
        return json({ job: current, saved: false }); // A readback, never a new admission.
      }
      // Do not strand a new pending attempt when dispatch cannot be authorized.
      if (!dispatchAuthorityAvailable(request, user, true)) throw new WorkError('実行権限を確認できないため開始できません。', 503);
      // Neither a timeout nor client-observed text establishes that an external
      // side effect is terminal. A separate reconciliation policy is required.
      if (attempts.length || observations.length) throw new WorkError('前の実行状態を照合するまで新しい実行を開始できません。', 409);
      if (current.revision !== input.revision) throw new WorkError('仕事が更新されました。読み直して確認してください。', 409);
      if (current.status !== 'active') throw new WorkError('この仕事では新しい実行を開始できません。', 409);
      const nowMs = Date.now(), now = new Date(nowMs).toISOString(), expiresAt = nowMs + CAPABILITY_TTL_MS;
      const token = newWorkToolCapability();
      const capabilityHash = await workToolCapabilityHash({ owner: user, jobId, attemptId: expected.id,
        inputSha256: expected.inputSha256, expiresAt, token });
      const entry: WorkToolAttempt = { schema: 'rockstaros.work-tool-attempt/1', ...expected, state: 'pending',
        startedAt: now, capabilityHash, capabilityExpiresAt: expiresAt };
      const next = { ...current, revision: current.revision + 1, updatedAt: now, toolAttempts: [...attempts, entry] };
      // Atomically require the same owner, job revision and enabled Agent revision.
      // This records an intent fence; it is not a Tool grant or authority token.
      const updated = await db.prepare(`UPDATE work_jobs SET payload = ?, revision = ?, updated_at = ?
        WHERE id = ? AND user_id = ? AND revision = ? AND EXISTS (
          SELECT 1 FROM sky_agent_settings a WHERE a.owner_user_id = ? AND a.id = ? AND a.revision = ?
            AND json_extract(a.settings, '$.enabled') = 1
            AND json_extract(a.settings, '$.requirements.packageKey') = ?
            AND json_extract(a.settings, '$.requirements.executionTarget') = 'pc'
            AND (a.source_tool IS NULL OR EXISTS (SELECT 1 FROM sky_connections c
              WHERE c.user_id = a.owner_user_id AND c.tool = a.source_tool))
        ) AND EXISTS (SELECT 1 FROM sky_tool_packages p WHERE p.package_key = ? AND p.manifest_sha256 = ? AND p.status = 'verified'
          AND EXISTS (SELECT 1 FROM sky_tool_package_reviews r WHERE r.package_key = p.package_key
            AND r.manifest_sha256 = p.manifest_sha256 AND r.decision = 'verified'
            AND (r.expires_at IS NULL OR r.expires_at > CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER))))`)
        .bind(JSON.stringify(next), next.revision, next.updatedAt, jobId, user, current.revision,
          user, binding.agentId, binding.agentRevision, expected.packageKey, expected.packageKey, expected.manifestSha256).run();
      if (updated.meta.changes === 1) return json({ job: next, saved: true, operationCapability: { token, expiresAt } });
      const latest = await store.get(user, jobId), committed = latest?.toolAttempts?.find(row => row.id === expected.id);
      if (committed && sameAttempt(committed, expected)) return json({ job: latest, saved: false });
      throw new WorkError('担当または仕事が更新されました。読み直して確認してください。', 409);
    }

    if (input.action === 'observe') {
      if (Object.keys(input).length !== 5 || !Object.hasOwn(input, 'attemptId') || !Object.hasOwn(input, 'observation'))
        throw new WorkError('成果の内容を確認してください。');
      const attemptId = workId(input.attemptId), expected = result(input.observation), target = attempts.find(row => row.id === attemptId);
      if (!target) throw new WorkError('同じ仕事の実行記録を確認してください。', 409);
      const prior = observations.find(row => row.id === expected.id);
      if (prior) {
        if (target.observationId !== expected.id || !sameObservation(prior, target, expected))
          throw new WorkError('同じ成果IDに異なる内容があります。', 409);
        return json({ job: current, saved: false });
      }
      if (!['claimed', 'stop_requested'].includes(target.state) || target.observationId) throw new WorkError('実行の状態を確認してください。', 409);
      const stoppedAfterClaim = target.state === 'stop_requested' && target.claimedRevision === input.revision &&
        current.revision === Number(input.revision) + 1 && current.status === 'cancelled' &&
        current.events.at(-1)?.command.action === 'cancel';
      if (current.revision !== input.revision && !stoppedAfterClaim) throw new WorkError('仕事が更新されました。読み直して確認してください。', 409);
      if (observations.length >= MAX_ITEMS || observations.reduce((n, row) => n + encoder.encode(row.text ?? '').byteLength, 0) + encoder.encode(expected.text).byteLength > MAX_TOTAL_TEXT_BYTES)
        throw new WorkError('この仕事に保存できる成果の上限です。', 409);
      const now = new Date().toISOString();
      const entry: WorkToolObservation = { schema: 'rockstaros.work-tool-observation/1', ...expected,
        packageKey: target.packageKey, manifestSha256: target.manifestSha256, connectorId: target.connectorId,
        toolName: target.toolName, verification: 'client_observed_unverified', recordedAt: now };
      const next = { ...current, revision: current.revision + 1, updatedAt: now,
        toolAttempts: attempts.map(row => row.id === attemptId ? { ...row, state: 'observed_unverified' as const, observationId: expected.id } : row),
        toolObservations: [...observations, entry] };
      if (await store.update(user, next, current.revision)) return json({ job: next, saved: true });
      const latest = await store.get(user, jobId), committed = latest?.toolObservations?.find(row => row.id === expected.id);
      const latestAttempt = latest?.toolAttempts?.find(row => row.id === attemptId);
      if (committed && latestAttempt?.observationId === expected.id && sameObservation(committed, latestAttempt, expected))
        return json({ job: latest, saved: false });
      throw new WorkError('仕事が更新されました。読み直して確認してください。', 409);
    }
    throw new WorkError('操作を確認してください。');
  } catch (error) { return rejected(request, error); }
}
