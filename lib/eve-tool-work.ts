import { createEvePlannerState, transitionEvePlanner } from './eve-planner-state.ts';
import { createWorkJob, updateEveToolPlanner, updateComposedWork, applyWorkCommand, objectInput, workId, WorkError, type WorkJob } from './workflow.ts';
import { executeCompositionNode } from './work-composition-executor.ts';
import { runnableCompositionNodes, CompositionError } from './work-composition.ts';
import { workStore } from './work-store.ts';
import { eveHistoryStore, EveHistoryError, eveThreadId, type EveHistoryKeys } from './eve-history.ts';
import { parseEvePlanCandidate, eveTextDigest, eveCitationRepairPlan } from './eve-plan-candidate.ts';
import { MR_COMMIT } from './mr-tools.ts';
import { readSkyUsageObservation } from './sky-usage-observation.ts';

const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), b => b.toString(16).padStart(2, '0')).join('');
const text = (value: unknown, limit: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new WorkError(`入力は1〜${limit}文字にしてください。`);
  return value;
};
/** Independent of formatCitations: preserve the set of Markdown link destinations,
 * including links inside code. This verifies URL preservation, not source truth. */
export function verifyEveCitationOutput(source: string, output: string) {
  const urls = (value: string) => [...new Set([...value.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)].map(m => m[1]))].sort();
  const before = urls(source), after = urls(output);
  return [
    { name: '成果あり', passed: Boolean(output.trim()) && output.length <= 12000, detail: `${output.length}文字` },
    { name: '出典URL保持', passed: JSON.stringify(before) === JSON.stringify(after), detail: `${before.length}件のリンク先を比較（内容の真偽は未検証）` },
  ];
}

function plannerHistory(job: WorkJob) {
  const plan = job.eveTool?.planning;
  if (!plan) return '';
  const lines = [`計画用AI: ${plan.modelLabel}（指定した接続先のモデル）`];
  for (const [i, attempt] of plan.attempts.entries()) {
    const inference = attempt.inference;
    if (inference?.state === 'not_sent') { lines.push(`計画の試行${i + 1}: AIへ未送信・版の確認で停止`); continue; }
    const usage = readSkyUsageObservation(inference?.usage);
    const identity = inference?.modelIdentity?.status;
    lines.push(`計画の試行${i + 1}: ${inference?.state === 'reported' ? '応答の観測あり' : '応答・使用量の確認未完了'}`);
    if (identity) lines.push(`AIの版: ${identity === 'observed_match' ? '前後の観測一致（実行重みの証明ではありません）' : identity === 'changed' ? '変更を検出・候補採用不可' : '確認できません'}`);
    const names: Record<string, string> = { input_tokens: '入力', output_tokens: '出力', cached_input_tokens: 'キャッシュ入力（入力の内訳）' };
    if (usage) for (const meter of usage.metrics) {
      if (names[meter.meter]) lines.push(`${names[meter.meter]}: ${meter.quantity === null ? '未報告' : `${meter.quantity} tokens`}`);
    }
    else lines.push('計画AIの使用量: 未報告');
    lines.push('計画AIの金額: 未確定。請求・入金・作者報酬の証明ではありません。');
  }
  return lines.join('\n');
}

function planningHistoryState(job: WorkJob) {
  const plan = job.eveTool?.planning;
  if (!plan || ['adopted', 'recipe'].includes(plan.status) || job.status !== 'active') return null;
  const attempt = plan.attempts.at(-1);
  if (attempt?.inference?.blockedReason === 'model_changed') return 'AIの版変更・候補採用停止';
  if (attempt?.inference?.blockedReason === 'model_unavailable') return 'AIの版を確認できません・要確認';
  if (plan.status === 'proposed') return '計画候補を検証済み・本人の採用待ち';
  if (plan.status === 'leased') return '計画用AIの応答待ち';
  if (attempt?.state === 'unknown') return '計画用AIの結果不明・要確認';
  if (attempt?.state === 'invalid') return '計画候補不合格・再検討待ち';
  return '計画作成待ち';
}

export function eveToolWorkStore(db: Pick<D1Database, 'prepare' | 'batch'>, owner: string, keys?: EveHistoryKeys) {
  const works = workStore(db), history = keys ? eveHistoryStore(db, owner, keys, true) : null;
  function requireHistory() {
    if (!history) throw new EveHistoryError('会話の暗号化保存が未設定です。仕事の停止と読取りはできます。', 503);
    return history;
  }
  async function get(id: string) {
    const job = await works.get(owner, workId(id));
    if (!job?.eveTool || !job.composition) throw new WorkError('Eveの仕事が見つかりません。', 404);
    return job;
  }
  async function sync(job: WorkJob, existingWork = true) {
    const binding = job.eveTool!;
    let current;
    try { current = await requireHistory().get(binding.threadId); }
    catch (e) { if (!(e instanceof EveHistoryError) || e.status !== 404) throw e; }
    const output = job.composition?.artifacts[job.eveTool?.outputStepId ?? 's1']?.text;
    const state = planningHistoryState(job) ?? (job.status === 'completed' ? '検査済み・完了' : job.status === 'cancelled' ? '停止済み' : job.eveTool?.pendingFailure ? (job.eveTool.pendingFailure.repairable ? '限定修正待ち' : '要確認・自動続行停止') : job.status === 'review' ? '検査済み・確認待ち' : '続行待ち');
    const planner = plannerHistory(job);
    const failure = binding.pendingFailure;
    const failedChecks = failure ? job.composition?.artifacts[failure.stepId]?.checks.filter(c => !c.passed) ?? [] : [];
    const failureSummary = failure ? `未解決の工程: ${failure.stepId} / ${failure.code} / ${failure.repairable ? '限定修正可能' : '完成条件を保った自動修正は不可'}\n${failedChecks.map(c => `未達の完成条件: ${c.name} — ${c.detail}`).join('\n')}\n` : '';
    const result = `Eveの仕事: ${job.id}\n状態: ${state}\n担当: ${binding.planner === 'validated-llm-candidate/1' ? 'LLM候補を検証した引用整形' : job.eveTool?.planning && !['adopted', 'recipe'].includes(job.eveTool.planning.status) ? '計画を確認中・Tool未実行' : '決定的な引用整形'}\nTool: mr-citations (${MR_COMMIT})\n実行先: サイト側の固定処理（Pixel内Linuxではありません）\n${planner ? `${planner}\n` : ''}${failureSummary}${job.eveTool?.verification?.checks.map(c => `${c.passed ? '合格' : '要確認'}: ${c.name} — ${c.detail}`).join('\n') ?? '独立検査は未完了'}${output ? `\n\n${output}` : ''}`;
    const messages = [
      { id: `tool-goal-${job.id}`, side: 'me' as const, text: job.plan.objective },
      { id: `tool-result-${job.id}`, side: 'sky' as const, text: result, tool: 'mr-citations' },
    ];
    await requireHistory().save({ session: {
      ...(current?.session ?? { version: 1, id: binding.threadId, toolId: 'mr-citations', createdAt: Date.parse(job.createdAt), workflowStatus: 'ready', outcome: null }),
      messages, activeRequest: null,
    }, revision: current?.revision ?? 0, remember: current?.remember ?? false }, existingWork ? { jobId: job.id, revision: job.revision } : undefined);
  }
  async function response(job: WorkJob) {
    let historySaved = true;
    try { await sync(job); } catch { historySaved = false; }
    return { job, historySaved, usage: { provider: 'bounded-local-tool', currency: 'JPY', amountMinor: 0, paidProviderCalled: false, developerPayment: 'contract_not_bound' } };
  }
  return {
    async list(threadId?: string) {
      if (threadId) eveThreadId(threadId);
      return (await works.list(owner, {kind: 'tool', ...(threadId?{threadId}:{})})).filter(job => job.eveTool && (!threadId || job.eveTool.threadId === threadId));
    },
    get,
    async projectHistory(id: string) {
      let job = await get(id);
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await sync(job); return { job, historySaved: true }; }
        catch (error) { if (!(error instanceof EveHistoryError) || error.status !== 409) return { job, historySaved: false }; }
        job = await get(id);
      }
      return { job, historySaved: false };
    },
    async create(raw: unknown) {
      const v = objectInput(raw, ['jobId', 'threadId', 'objective', 'source', 'saveMaterial', 'plannerCandidate', 'plannerModel', 'plannerRequest']);
      const id = workId(v.jobId), threadId = eveThreadId(v.threadId), objective = text(v.objective, 1000), source = text(v.source, 10000);
      if (v.saveMaterial !== true) throw new WorkError('本人用の素材・成果保存に同意してください。');
      const sourceSha256 = await digest(source);
      const planning = v.plannerRequest === undefined ? null : createEvePlannerState(v.plannerRequest);
      if (planning && (v.plannerCandidate !== undefined || v.plannerModel !== undefined)) throw new WorkError('保存前の候補と永続計画作成を同時に指定できません。');
      const candidate = v.plannerCandidate === undefined ? null : parseEvePlanCandidate(v.plannerCandidate as string, { jobId: id, objective, sourceSha256 });
      if (v.plannerModel !== undefined && (typeof v.plannerModel !== 'string' || v.plannerModel.length > 120 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/.test(v.plannerModel))) throw new WorkError('モデルの表示名を確認してください。');
      if (!candidate && v.plannerModel !== undefined) throw new WorkError('モデル名だけで計画を作成済みにできません。');
      const candidateHash = candidate ? await eveTextDigest(JSON.stringify(candidate)) : null;
      const requestSha256 = await digest(JSON.stringify({ threadId, objective, sourceSha256, ...(planning ? { plannerRequest: { modelLabel: planning.modelLabel, modelDigest: planning.modelDigest } } : {}), ...(candidateHash ? { candidateHash, modelLabel: v.plannerModel ?? null } : {}) }));
      const old = await works.get(owner, id);
      if (old) {
        if (old.eveTool?.requestSha256 !== requestSha256) throw new WorkError('同じ仕事IDの内容が異なります。', 409);
        return response(old);
      }
      const job = createWorkJob({ id, title: objective.slice(0, 120), templateId: 'composition', plan: {
        version: 1, objective, acceptance: '入力のリンク先を保持し、引用整形した成果を検査する。事実確認は含まない。', inputKind: 'text', budgetMinor: 0, currency: 'JPY', deadline: '',
        nodes: candidate?.nodes ?? [ { id: 's1', tool: 'mr-citations', inputs: ['source'], config: {} }, { id: 's2', tool: 'compose-check', inputs: ['s1'], config: { minChars: 1, requiredText: [] } } ],
      } });
      job.eveTool = { schema: 'eve.tool-work/1', threadId, requestSha256, sourceSha256, planner: candidate ? 'validated-llm-candidate/1' : 'deterministic-citations/1',
        planSha256: await digest(JSON.stringify(job.composition!.plan)),
        ...(planning ? { planning } : {}),
        ...(candidateHash ? { plannerCandidate: { sha256: candidateHash, origin: 'untrusted-submitted-candidate' as const, modelLabel: typeof v.plannerModel === 'string' ? v.plannerModel : null } } : {}),
      };
      job.composition!.source = source;
      // History tombstones/owner conflicts must reject before creating a new job.
      await sync(job, false);
      const saved = await works.create(owner, job, { threadId });
      if (!saved || saved.eveTool?.requestSha256 !== requestSha256) throw new WorkError('仕事IDが使用されています。', 409);
      return response(saved);
    },
    async plannerCommand(raw: unknown) {
      const v = objectInput(raw, ['jobId', 'revision', 'commandId', 'action', 'attemptId', 'output']);
      const job = await get(workId(v.jobId));
      if (!job.eveTool!.planning) throw new WorkError('永続計画作成の仕事を選んでください。', 409);
      if (!job.eveTool!.planning.commands.some(c => c.id === v.commandId) && (job.composition!.operations.some(c => c.id === v.commandId) || job.events.some(c => c.command.id === v.commandId))) throw new WorkError('同じ操作IDを別の操作へ使えません。', 409);
      const context = { jobId: job.id, objective: job.plan.objective, sourceSha256: job.eveTool!.sourceSha256 };
      const result = await transitionEvePlanner(job.eveTool!.planning, v, context);
      if (result.replay) return response(job);
      if (v.revision !== job.revision) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
      await requireHistory().get(job.eveTool!.threadId);
      if (await digest(job.composition!.source!) !== context.sourceSha256) throw new WorkError('素材が変更されています。', 409);
      const candidate = result.state.status === 'adopted' ? parseEvePlanCandidate(result.state.candidate!, context) : null;
      const plan = candidate ? { ...job.composition!.plan, nodes: candidate.nodes } : undefined;
      const next = updateEveToolPlanner(job, result.state, workId(v.commandId), result.fingerprint, plan);
      if (candidate) next.eveTool = { ...next.eveTool!, planner: 'validated-llm-candidate/1', planSha256: await digest(JSON.stringify(next.composition!.plan)), plannerCandidate: { sha256: await digest(JSON.stringify(candidate)), origin: 'untrusted-submitted-candidate', modelLabel: result.state.modelLabel } };
      if (!await works.update(owner, next, job.revision)) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
      return response(next);
    },
    async command(raw: unknown) {
      const v = objectInput(raw, ['jobId', 'revision', 'commandId', 'action']);
      const job = await get(String(v.jobId)), id = workId(v.commandId);
      if (job.eveTool?.planning?.commands.some(c => c.id === id)) throw new WorkError('同じ操作IDを別の操作へ使えません。', 409);
      if (!['advance', 'complete', 'cancel', 'sync'].includes(String(v.action))) throw new WorkError('操作を確認してください。');
      if (v.action === 'sync') return response(job);
      if (!['cancel', 'sync'].includes(String(v.action)) && job.eveTool!.planning && !['adopted', 'recipe'].includes(job.eveTool!.planning.status)) throw new WorkError('保存した計画候補を採用するか、固定手順へ明示的に切り替えてください。', 409);
      const fingerprint = await digest(JSON.stringify({ action: v.action, revision: v.revision }));
      const op = job.composition!.operations.find(item => item.id === id);
      const event = job.events.find(item => item.command.id === id);
      if (op || event) {
        if (op ? op.fingerprint !== fingerprint : event!.command.action !== v.action) throw new WorkError('同じ操作IDの内容が異なります。', 409);
        return response(job);
      }
      if (v.revision !== job.revision) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
      // A deleted conversation cannot restart execution via a stale work reference.
      if (v.action !== 'cancel') await requireHistory().get(job.eveTool!.threadId);
      if (v.action === 'advance' && ((job.eveTool!.planSha256 && await digest(JSON.stringify(job.composition!.plan)) !== job.eveTool!.planSha256) || typeof job.composition!.source !== 'string' || await digest(job.composition!.source) !== job.eveTool!.sourceSha256)) throw new WorkError('素材が変更されています。', 409);
      let next: WorkJob;
      if (v.action === 'advance' && job.eveTool?.pendingFailure) {
        const failure = job.eveTool.pendingFailure;
        const plan = failure.repairable ? eveCitationRepairPlan(job, failure.stepId, failure.code) : null;
        if (!plan) throw new WorkError('完成条件を保った自動修正はできません。成果を確認するか停止してください。', 409);
        next = updateComposedWork(job, { id, fingerprint, revision: job.revision, action: 'revise', plan });
        next.eveTool = { ...job.eveTool, pendingFailure: undefined, repairCount: (job.eveTool.repairCount ?? 0) + 1, planSha256: await digest(JSON.stringify(plan)) };
        const retained = next.composition!.artifacts[plan.nodes[0].id];
        next.eveTool.outputStepId = plan.nodes[0].id;
        if (retained) next.eveTool.verification = { outputSha256: await digest(retained.text), checkedAt: new Date().toISOString(), checks: verifyEveCitationOutput(next.composition!.source!, retained.text) };
      } else if (v.action === 'advance') {
        const node = runnableCompositionNodes(job.composition!)[0];
        if (!node || job.status !== 'active') throw new WorkError('実行できる手順がありません。', 409);
        const source = job.composition!.source!;
        if ((job.eveTool!.planSha256 && await digest(JSON.stringify(job.composition!.plan)) !== job.eveTool!.planSha256) || await digest(source) !== job.eveTool!.sourceSha256) throw new WorkError('素材が変更されています。', 409);
        let artifact;
        try { artifact = await executeCompositionNode(job.composition!, node, source); }
        catch (error) {
          const code = error instanceof CompositionError && error.status === 413 ? 'output_limit' : 'adapter_failed';
          next = updateComposedWork(job, { id, fingerprint, revision: job.revision, action: 'fail', stepId: node.id });
          next.eveTool = { ...job.eveTool!, pendingFailure: { stepId: node.id, code, repairable: Boolean(eveCitationRepairPlan(job, node.id, code)) }, failures: [...(job.eveTool?.failures ?? []), { stepId: node.id, commandId: id, code, at: new Date().toISOString(), planSha256: job.eveTool!.planSha256 ?? await digest(JSON.stringify(job.composition!.plan)) }] };
          if (!await works.update(owner, next, job.revision)) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
          return response(next);
        }
        if (node.tool === 'mr-citations') {
          const checks = verifyEveCitationOutput(source, artifact.text);
          artifact.checks.push(...checks);
          artifact.status = checks.every(c => c.passed) ? 'passed' : 'needs_review';
        }
        next = updateComposedWork(job, { id, fingerprint, revision: job.revision, action: 'run', stepId: node.id, source, result: artifact });
        if (artifact.status !== 'passed') next.eveTool = { ...job.eveTool!, pendingFailure: { stepId: node.id, code: 'verification_failed', repairable: false }, failures: [...(job.eveTool?.failures ?? []), { stepId: node.id, commandId: id, code: 'verification_failed', at: new Date().toISOString(), planSha256: job.eveTool!.planSha256 ?? await digest(JSON.stringify(job.composition!.plan)) }] };
        const output = next.composition!.artifacts[node.id];
        if (output) next.eveTool = { ...(next.eveTool ?? job.eveTool!), outputStepId: node.id, verification: { outputSha256: await digest(output.text), checkedAt: new Date().toISOString(), checks: verifyEveCitationOutput(source, output.text) } };
      } else {
        if (v.action === 'complete') {
          const result = job.composition!.artifacts[job.eveTool?.outputStepId ?? 's1'];
          if (job.eveTool?.pendingFailure || !result || !job.eveTool?.verification || await digest(result.text) !== job.eveTool.verification.outputSha256 || !verifyEveCitationOutput(job.composition!.source!, result.text).every(c => c.passed)) throw new WorkError('成果の独立検査を確認してください。', 409);
        }
        next = applyWorkCommand(job, v.action === 'cancel' ? { id, action: 'cancel' } : { id, action: 'complete', note: '独立したURL保持検査を確認' }, job.revision);
      }
      if (!await works.update(owner, next, job.revision)) throw new WorkError('別の操作で更新されました。再読込してください。', 409);
      return response(next);
    },
  };
}
