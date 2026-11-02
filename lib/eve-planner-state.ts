import { WorkError, objectInput, workId } from './workflow.ts';
import { parseEvePlanCandidate, eveTextDigest, EVE_PLANNER_MAX_ATTEMPTS, type EvePlannerContext } from './eve-plan-candidate.ts';

export const EVE_PLANNER_LEASE_MS = 90000;
export type EvePlannerState = {
  schema: 'eve.planner-state/1'; modelLabel: string; modelDigest: string;
  status: 'draft' | 'leased' | 'proposed' | 'adopted' | 'recipe';
  attempts: { id: string; startedAt: number; leaseUntil: number; state: 'leased' | 'invalid' | 'accepted' | 'unknown'; outputSha256?: string; reason?: 'candidate_invalid' | 'lease_expired' | 'client_abandoned' | 'inference_unconfirmed' | 'model_changed' | 'model_unavailable'; inference?: { state: 'sending' | 'reported' | 'unknown' | 'not_sent'; startedAt: number; finishedAt?: number; usage: import('./sky-usage-observation.ts').SkyUsageObservation | null; outputSha256?: string; errorCode?: 'upstream_timeout' | 'provider_failed'; blockedReason?: 'model_changed' | 'model_unavailable'; modelIdentity?: { beforeDigest: string | null; afterDigest: string | null; status: 'observed_match' | 'changed' | 'unavailable' } } }[];
  candidate?: string;
  commands: { id: string; fingerprint: string }[];
};
export function createEvePlannerState(raw: unknown): EvePlannerState {
  const v = objectInput(raw, ['modelLabel', 'modelDigest']);
  if (typeof v.modelLabel !== 'string' || v.modelLabel.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(v.modelLabel) || typeof v.modelDigest !== 'string' || !/^[a-f0-9]{64}$/.test(v.modelDigest)) throw new WorkError('導入済みモデルの名前とハッシュを確認してください。');
  return { schema: 'eve.planner-state/1', modelLabel: v.modelLabel, modelDigest: v.modelDigest, status: 'draft', attempts: [], commands: [] };
}
/** Persist untrusted client proposals, not proof of inference, usage or permission. */
export async function transitionEvePlanner(state: EvePlannerState, raw: unknown, context: EvePlannerContext, now = Date.now(), trustedInference = false) {
  const v = objectInput(raw, ['jobId', 'revision', 'commandId', 'action', 'attemptId', 'output']);
  const id = workId(v.commandId), action = String(v.action);
  if (!['planner-claim', 'planner-submit', 'planner-abandon', 'planner-adopt', 'planner-recipe'].includes(action)) throw new WorkError('計画の操作を確認してください。');
  if (action !== 'planner-submit' && v.output !== undefined) throw new WorkError('この操作には候補本文を渡せません。');
  if (!['planner-submit', 'planner-abandon'].includes(action) && v.attemptId !== undefined) throw new WorkError('この操作には試行IDを渡せません。');
  const fingerprint = await eveTextDigest(JSON.stringify({ action, attemptId: v.attemptId ?? null, output: v.output ?? null }));
  const replay = state.commands.find(c => c.id === id);
  if (replay) {
    if (replay.fingerprint !== fingerprint) throw new WorkError('同じ操作IDの内容が異なります。', 409);
    return { state, replay: true, fingerprint };
  }
  if (state.commands.length >= 12 || ['adopted', 'recipe'].includes(state.status)) throw new WorkError('計画作成は終了しています。', 409);
  const next: EvePlannerState = { ...state, attempts: state.attempts.map(a => ({ ...a })), commands: [...state.commands, { id, fingerprint }] };
  if (action === 'planner-claim') {
    const pending = next.attempts.at(-1);
    if (pending?.state === 'leased') {
      if (pending.leaseUntil > now) throw new WorkError('同じ仕事の計画作成が進行中です。期限後に状態を確認してください。', 409);
      pending.state = 'unknown'; pending.reason = 'lease_expired';
    }
    if (next.status === 'proposed' || next.attempts.length >= EVE_PLANNER_MAX_ATTEMPTS) throw new WorkError('保存した候補を確認するか、固定手順へ切り替えてください。試行上限は2回です。', 409);
    next.attempts.push({ id, startedAt: now, leaseUntil: now + EVE_PLANNER_LEASE_MS, state: 'leased' }); next.status = 'leased';
  } else if (action === 'planner-submit' || action === 'planner-abandon') {
    const attempt = next.attempts.at(-1);
    if (!attempt || attempt.id !== workId(v.attemptId) || attempt.state !== 'leased') throw new WorkError('現在の計画作成の試行IDを確認してください。', 409);
    if (action === 'planner-submit' && attempt.inference && !trustedInference) throw new WorkError('この試行はserverで応答を照合します。再読込してください。', 409);
    if (action === 'planner-abandon' || attempt.leaseUntil <= now) {
      attempt.state = 'unknown'; attempt.reason = action === 'planner-abandon' ? 'client_abandoned' : 'lease_expired'; next.status = 'draft';
    } else {
      if (typeof v.output !== 'string' || v.output.length > 16000) throw new WorkError('候補は16000文字以内で送信してください。');
      attempt.outputSha256 = await eveTextDigest(v.output);
      try { next.candidate = JSON.stringify(parseEvePlanCandidate(v.output, context)); attempt.state = 'accepted'; next.status = 'proposed'; }
      catch (e) { if (!(e instanceof WorkError)) throw e; attempt.state = 'invalid'; attempt.reason = 'candidate_invalid'; next.status = 'draft'; }
    }
  } else if (action === 'planner-adopt') {
    if (next.status !== 'proposed' || !next.candidate) throw new WorkError('検証済みの候補を確認してください。', 409);
    parseEvePlanCandidate(next.candidate, context); next.status = 'adopted';
  } else {
    // Explicit owner fallback also invalidates a late result from a running call.
    const pending = next.attempts.at(-1);
    if (pending?.state === 'leased') { pending.state = 'unknown'; pending.reason = 'client_abandoned'; }
    next.status = 'recipe'; next.candidate = undefined;
  }
  return { state: next, replay: false, fingerprint };
}
