import { generateText, LlmProviderError, type LlmRuntimeEnv, type TextGenerationResult } from './llm-providers.ts';
import { eveToolWorkStore } from './eve-tool-work.ts';
import { workStore } from './work-store.ts';
import { eveHistoryStore, type EveHistoryKeys } from './eve-history.ts';
import { evePlannerPrompt, evePlannerResponseSchema, eveTextDigest } from './eve-plan-candidate.ts';
import { transitionEvePlanner } from './eve-planner-state.ts';
import { readSkyUsageObservation, observeLlmUsage } from './sky-usage-observation.ts';
import { recordEvePlannerObservation, WorkError, objectInput, workId } from './workflow.ts';
import { readOllamaModelDigest } from './ollama-model-inventory.ts';

/** Server-only binding to the existing local provider adapter. Never accepts a
 * client usage receipt, starts a second call, or grants spending/Tool authority. */
export async function runEvePlannerInference(
  db: Pick<D1Database, 'prepare' | 'batch'>, owner: string, keys: EveHistoryKeys,
  raw: unknown, requestedModel: unknown, runtime: LlmRuntimeEnv,
  generate: typeof generateText = generateText,
  inspect: typeof readOllamaModelDigest = readOllamaModelDigest,
) {
  const v = objectInput(raw, ['jobId', 'attemptId']);
  const id = workId(v.jobId), attemptId = workId(v.attemptId);
  const works = workStore(db), tools = eveToolWorkStore(db, owner, keys);
  let job = await tools.get(id);
  const state = job.eveTool!.planning, attempt = state?.attempts.at(-1);
  if (!state || !attempt || attempt.id !== attemptId || attempt.state !== 'leased' || attempt.leaseUntil <= Date.now() || job.status !== 'active' || state.status !== 'leased' || attempt.inference)
    throw new WorkError('この試行は開始済み・期限切れ・停止済みです。保存状態を確認してください。', 409);
  if (requestedModel !== state.modelLabel) throw new WorkError('保存した計画用モデルと一致しません。', 409);
  const base = new URL(runtime.SKY_OLLAMA_BASE_URL || 'http://127.0.0.1:11434');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash)
    throw new WorkError('この計画作成は端末内のOllama接続だけを使用できます。', 403);
  await eveHistoryStore(db, owner, keys, true).get(job.eveTool!.threadId);
  if (await eveTextDigest(job.composition!.source!) !== job.eveTool!.sourceSha256) throw new WorkError('保存した素材が変更されています。', 409);
  const context = { jobId: job.id, objective: job.plan.objective, sourceSha256: job.eveTool!.sourceSha256 };
  const instructions = evePlannerPrompt(context);
  let beforeDigest: string | null = null, afterDigest: string | null = null;
  try { beforeDigest = await inspect(state.modelLabel, runtime); } catch { /* No inference on unavailable inventory. */ }
  let blockedReason: 'model_changed' | 'model_unavailable' | undefined = !beforeDigest ? 'model_unavailable' : beforeDigest !== state.modelDigest ? 'model_changed' : undefined;
  if (attempt.leaseUntil <= Date.now()) throw new WorkError('モデル確認中に試行の期限が切れました。保存状態を確認してください。', 409);
  const sent = structuredClone(state);
  sent.attempts.at(-1)!.inference = { state: 'sending', startedAt: Date.now(), usage: null,
    modelIdentity: { beforeDigest, afterDigest: null, status: blockedReason === 'model_changed' ? 'changed' : 'unavailable' } };
  const sending = recordEvePlannerObservation(job, sent);
  if (!await works.update(owner, sending, job.revision)) throw new WorkError('別の操作で更新されました。推論は開始していません。', 409);
  let result: TextGenerationResult | undefined;
  let failureCode: 'upstream_timeout' | 'provider_failed' | undefined;
  let failureUsage: ReturnType<typeof readSkyUsageObservation> = null;
  const dispatched = !blockedReason;
  if (dispatched) try {
    result = await generate({ provider: 'ollama', model: state.modelLabel, ...instructions, ollamaSchema: evePlannerResponseSchema(context), ollamaLocalTimeoutMs: 40_000,
      prompt: instructions.prompt + (state.attempts.length > 1 ? '\nThe previous candidate failed. Return the exact JSON schema with matching identifiers and permitted nodes only.' : ''), maxOutputTokens: 600 }, runtime);
  } catch (error) {
    failureCode = error instanceof LlmProviderError && error.code === 'UPSTREAM_TIMEOUT' ? 'upstream_timeout' : 'provider_failed';
    // A trusted adapter can observe counters even when the response text is unusable.
    // Keep those counters without creating a candidate or treating the attempt as success.
    const usage = error instanceof LlmProviderError ? readSkyUsageObservation(error.metering) : null;
    if (usage?.source === 'llm' && usage.providerId === 'ollama') failureUsage = usage;
  }
  const outputSha256 = result ? await eveTextDigest(result.text) : undefined;
  const observation = result ? readSkyUsageObservation(result.metering) ?? { ...observeLlmUsage('ollama', {}), resourceId: state.modelLabel } : failureUsage;
  if (result || observation) {
    try { afterDigest = await inspect(state.modelLabel, runtime); } catch { /* Keep reported usage, withhold the candidate. */ }
    blockedReason = !afterDigest || !observation?.reportedResourceId ? 'model_unavailable'
      : afterDigest !== state.modelDigest || observation.reportedResourceId !== state.modelLabel ? 'model_changed' : undefined;
  }
  // Only this trusted adapter boundary can attach provider observations. Late
  // observations survive stop/expiry, but must never revive or adopt a plan.
  for (let retry = 0; retry < 3; retry++) {
    job = await tools.get(id);
    let nextState = structuredClone(job.eveTool!.planning!);
    const target = nextState.attempts.find(a => a.id === attemptId);
    if (!target?.inference) throw new WorkError('推論の保存状態を確認してください。再送はしないでください。', 409);
    if (target.inference.state !== 'sending') {
      const projected = await tools.projectHistory(id);
      return { eveWork: projected.job, historySaved: projected.historySaved, inferenceOutcome: target.inference.state, plannerBlocked: target.inference.blockedReason };
    }
    if (job.status === 'active' && nextState.status === 'leased' && nextState.attempts.at(-1)?.id === attemptId && target.state === 'leased') {
      if (blockedReason) {
        target.state = 'invalid'; target.reason = blockedReason; nextState.status = 'draft';
      } else try {
        const transition = await transitionEvePlanner(nextState, {
          commandId: crypto.randomUUID(), action: result ? 'planner-submit' : 'planner-abandon', attemptId,
          ...(result ? { output: result.text } : {}),
        }, context, Date.now(), true);
        nextState = transition.state;
      } catch (error) {
        if (!(error instanceof WorkError)) throw error;
        const rejected = nextState.attempts.find(a => a.id === attemptId)!;
        rejected.state = 'invalid'; rejected.reason = 'candidate_invalid'; nextState.status = 'draft';
      }
    }
    const finalAttempt = nextState.attempts.find(a => a.id === attemptId)!;
    if (!result && finalAttempt.state === 'unknown') finalAttempt.reason = 'inference_unconfirmed';
    finalAttempt.inference = { state: result || observation ? 'reported' : dispatched ? 'unknown' : 'not_sent', startedAt: target.inference.startedAt,
      finishedAt: Date.now(), usage: observation, ...(outputSha256 ? { outputSha256 } : {}), ...(failureCode ? { errorCode: failureCode } : {}),
      ...(blockedReason ? { blockedReason } : {}), modelIdentity: { beforeDigest, afterDigest,
        status: blockedReason === 'model_changed' ? 'changed' : (result || observation) && !blockedReason ? 'observed_match' : 'unavailable' } };
    const next = recordEvePlannerObservation(job, nextState);
    if (await works.update(owner, next, job.revision)) {
      const projected = await tools.projectHistory(id);
      return { eveWork: projected.job, historySaved: projected.historySaved, inferenceOutcome: finalAttempt.inference.state, plannerBlocked: blockedReason };
    }
  }
  throw new WorkError('使用量の保存を確認できません。同じ試行を再送せず保存状態を照合してください。', 503);
}
