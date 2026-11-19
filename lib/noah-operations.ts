import { LIMITS } from './noah-execution-contract.mjs';
import type { WorkJob } from './workflow.ts';
import type { NoahExecution } from './noah-execution.ts';
import { createNoahWork, executionInputDigest, noahDigest, NoahExecutionError } from './noah-execution.ts';
import { canonicalOperationValue, operationBinding, operationRunId, operationUuid, parseOperationRequest, parseOperationRuntimeUpdate, operationRuntimeReplay, operationRuntimeEditable } from './noah-operation-contract.mjs';
import { noahModelDigest } from './noah-model-catalog.mjs';

import { matchesOperationEvent, operationEvent, operationEventPrompt, type NoahOperationEvent, type NoahEventCursor } from './noah-operation-events.ts';

export type NoahOperationBinding = Pick<NoahExecution, 'agentId' | 'recipe' | 'version' | 'image' | 'model' | 'modelSha256' | 'provider' | 'source' | 'release' | 'invite'>;
export type NoahOperationConfig = { id: string; agentId: string; prompt: string; providerConsent?: 'codex-account/1'; intervalSeconds: number; maxRuns: number; maxModelCalls?: number; expiresAt: number; timeZone: string; confirmation: 'noah-operation/1'; trigger?: { kind: 'work.returned'; agentId: string } };
export type NoahOperation = {
  schema: 'noah-operation/1'; config: NoahOperationConfig; binding: NoahOperationBinding; requestSha256: string; leaseSha256?: string;
  reservedModelCalls?: number; modelBudgetSinceSequence?: number;
  state: 'enabled' | 'paused' | 'stopping' | 'blocked' | 'exhausted' | 'archived'; attempts: number; succeeded: number; nextRunAt: number | null;
  configVersion?: number; configs?: { version: number; config: NoahOperationConfig; changedAt: number }[]; eventCursor?: NoahEventCursor;
  bindingVersion?: number; bindings?: { version: number; binding: NoahOperationBinding; changedAt: number; commandId?: string; previousRevision?: number; candidateDigest?: string }[];
  active: { reservedModelCalls?: number; jobId: string; sequence: number; scheduledAt: number; configVersion?: number; bindingVersion?: number; event?: NoahOperationEvent; prompt?: string } | null;
  history: { jobId: string; sequence: number; scheduledAt: number; state: string; configVersion?: number; bindingVersion?: number; event?: NoahOperationEvent }[]; error?: string;
};
type Store = {
  get(user: string, id: string): Promise<WorkJob | null>;
  listNoahOperations(user: string, agentId?: string | null, archived?: boolean): Promise<WorkJob[]>;
  listNoahEvents(user: string, agentId: string, cursor: NoahEventCursor): Promise<WorkJob[]>;
  createNoahOperation(user: string, job: WorkJob): Promise<WorkJob | null>;
  updateNoahOperation(user: string, job: WorkJob, revision: number, restoring?: boolean): Promise<boolean>;
};
const fail = (message: string, status = 409): never => { throw new NoahExecutionError(message, status); };
const modelBudgetReached = (op: NoahOperation) => op.config.maxModelCalls !== undefined && (op.reservedModelCalls ?? 0) >= op.config.maxModelCalls;
const terminal = (state?: string) => ['returned', 'failed', 'cancelled', 'unknown'].includes(state || '');
export function presentNoahOperation(job: WorkJob) {
  return { ...job, noahOperation: { ...job.noahOperation!, leaseSha256: undefined } };
}
export async function validateOperationRun(store: Pick<Store, 'get'>, user: string, job: WorkJob) {
  const run = job.noahExecution!, ref = run.operation;
  if (!ref) return null;
  const parent = await store.get(user, ref.id), op = parent?.noahOperation;
  if (!op || parent!.templateId !== 'noah-operation' || op.state !== 'enabled' || op.config.expiresAt <= Date.now() ||
    op.active?.jobId !== job.id || op.active.sequence !== ref.sequence || run.prompt !== (op.active.prompt ?? op.config.prompt) || (ref.configVersion ?? 1) !== (op.active.configVersion ?? 1) ||
    (ref.bindingVersion ?? 1) !== (op.active.bindingVersion ?? 1) || (ref.bindingVersion ?? 1) !== (op.bindingVersion ?? 1) ||
    canonicalOperationValue(ref.event) !== canonicalOperationValue(op.active.event) ||
    canonicalOperationValue(operationBinding(run)) !== canonicalOperationValue(op.binding)) fail('運用の許可・固定版・予定が変わりました。');
  if (ref.event && !await matchesOperationEvent(await store.get(user, ref.event.jobId), ref.event)) fail('起点の成果が変わりました。');
  return parent!;
}
export function createNoahOperationService(store: Store, now = () => Date.now(), validateBinding: (user: string, binding: NoahExecution) => Promise<void> = async () => {}) {
  async function get(user: string, id: string) {
    if (!operationUuid(id)) fail('運用IDを確認してください。', 400);
    const job = await store.get(user, id);
    if (!job?.noahOperation || job.templateId !== 'noah-operation') fail('運用が見つかりません。', 404);
    return job!;
  }
  async function save(user: string, job: WorkJob, restoring = false) {
    const revision = job.revision; job.revision++; job.updatedAt = new Date(now()).toISOString();
    if (!await store.updateNoahOperation(user, job, revision, restoring)) fail('運用が更新されました。再読み込みしてください。');
    return presentNoahOperation(job);
  }
  async function settle(user: string, op: NoahOperation, stopping: boolean) {
    stopping = stopping || op.state === 'stopping';
    if (!op.active) return;
    const run = await store.get(user, op.active.jobId);
    if (run && (run.noahExecution?.operation?.id !== op.config.id || run.noahExecution.operation.sequence !== op.active.sequence)) fail('実行記録の参照が一致しません。');
    let state: string | undefined = run?.noahExecution?.state;
    if (!terminal(state)) {
      if (!stopping) fail('仕事の終了をまだ確認できません。');
      state = run ? 'unknown' : 'skipped';
    }
    const { jobId, sequence, scheduledAt, configVersion, bindingVersion, event } = op.active;
    op.history = [...op.history, { jobId, sequence, scheduledAt, configVersion, bindingVersion, event, state: state! }].slice(-20); op.active = null;
    if (state === 'returned' && run?.noahExecution?.result?.exitCode === 0) op.succeeded++;
    else { op.state = 'blocked'; op.error = state === 'unknown' ? '結果不明です。同じ仕事は自動で再実行しません。' : '処理を完了できませんでした。結果を確認して再開してください。'; }
    if (state === 'unknown') op.state = 'blocked';
    else if (stopping) { op.state = 'paused'; op.error = undefined; }
    if (!stopping && state !== 'unknown' && modelBudgetReached(op)) { op.state = 'exhausted'; op.nextRunAt = null; }
    if (op.state === 'enabled' && (op.attempts >= op.config.maxRuns || now() >= op.config.expiresAt || modelBudgetReached(op))) { op.state = 'exhausted'; op.nextRunAt = null; }
  }
  return {
    get,
    list: (user: string, agentId?: string | null, archived = false) => store.listNoahOperations(user, agentId, archived),
    async create(user: string, config: NoahOperationConfig, binding: NoahOperationBinding, lease: string) {
      if (!config || !binding || typeof config !== 'object' || typeof binding !== 'object' || Array.isArray(config) || Array.isArray(binding)) fail('運用するAgentと条件を確認してください。', 400);
      if (!/^[a-f0-9]{64}$/.test(lease || '')) fail('実行hostの確認が必要です。', 400);
      const requestSha256 = await noahDigest(canonicalOperationValue({ config, binding }));
      const previous = operationUuid(config?.id) ? await store.get(user, config.id) : null;
      if (previous) {
        if (previous.noahOperation?.requestSha256 !== requestSha256) fail('同じ運用IDの内容は変更できません。');
        return presentNoahOperation(previous);
      }
      try { parseOperationRequest(config, now()); } catch (e) { fail((e as Error).message, 400); }
      const probe = await createNoahWork(config.id, { ...binding, prompt: config.prompt, inputSha256: await executionInputDigest(config.agentId, config.prompt), claimSha256: await noahDigest(lease) });
      if (binding.agentId !== config.agentId || (probe.noahExecution!.provider ? config.providerConsent !== 'codex-account/1' : config.providerConsent !== undefined)) fail('運用するAgent・送信確認を照合できません。', 400);
      if (config.maxModelCalls !== undefined && binding.provider) fail('Codex内部のモデル呼出数は未計測です。モデル回数上限は指定できません。',400);
      const time = new Date(now()).toISOString();
      const job: WorkJob = { id: config.id, title: `定期運用: ${binding.recipe} ${config.prompt.slice(0, 60)}`, templateId: 'noah-operation',
        plan: { schemaVersion: 1, objective: config.prompt.slice(0, 1000), approvalGates: [] }, revision: 0, status: 'active', steps: [], events: [], createdAt: time, updatedAt: time,
        noahOperation: { schema: 'noah-operation/1', config, configVersion: 1, configs: [{ version: 1, config, changedAt: now() }], ...(config.trigger ? { eventCursor: { at: now(), id: '~' } } : {}), binding, bindingVersion: 1, bindings: [{ version: 1, binding, changedAt: now() }], requestSha256, leaseSha256: await noahDigest(lease), state: 'enabled', reservedModelCalls: 0, modelBudgetSinceSequence: 1, attempts: 0, succeeded: 0, nextRunAt: now(), active: null, history: [] } };
      const saved = await store.createNoahOperation(user, job);
      if (!saved?.noahOperation) fail('運用は20件までです。保存済みの運用を確認してください。', 429);
      if (saved!.noahOperation!.requestSha256 !== requestSha256) fail('運用IDが使用されています。');
      return presentNoahOperation(saved!);
    },
    async command(user: string, input: { id: string; action: string; revision: number; lease?: string; binding?: NoahOperationBinding; config?: NoahOperationConfig; commandId?: string; candidateDigest?: string; confirmation?: string; occurrenceId?: string; modelCall?: number }) {
      const job = await get(user, input.id), op = job.noahOperation!;
      if (input.action === 'rebind') {
        try { parseOperationRuntimeUpdate({ revision: input.revision, commandId: input.commandId, candidateDigest: input.candidateDigest, confirmation: input.confirmation }); } catch (e) { fail((e as Error).message, 400); }
        try { if (operationRuntimeReplay(op, input)) return presentNoahOperation(job); } catch (e) { fail((e as Error).message); }
      }
      if (job.revision !== input.revision) fail('運用が更新されました。再読み込みしてください。');
      if (!['claim', 'settle', 'pause', 'finishPause', 'resume', 'revise', 'archive', 'restore', 'rebind', 'reserveModel'].includes(input.action)) fail('対応しない運用操作です。', 400);
      if (input.action === 'rebind') {
        if (!operationRuntimeEditable(op)) fail('停止と結果を確認してから実行環境を変更してください。');
        const binding = input.binding, version = op.bindingVersion ?? 1;
        if (!binding || typeof binding !== 'object' || Array.isArray(binding) || binding.agentId !== op.config.agentId || canonicalOperationValue(binding) !== canonicalOperationValue(operationBinding(binding))) fail('同じAgentの実行環境を確認してください。', 400);
        if (await noahDigest(canonicalOperationValue(binding)) !== input.candidateDigest) fail('候補が変わりました。変更内容を再確認してください。');
        if (canonicalOperationValue(binding) === canonicalOperationValue(op.binding)) fail('実行環境に変更はありません。');
        if (version >= 20) fail('実行環境の変更は20版までです。', 429);
        const probe = await createNoahWork(job.id, { ...binding!, prompt: op.config.prompt, inputSha256: await executionInputDigest(op.config.agentId, op.config.prompt), claimSha256: '0'.repeat(64) });
        if ((binding!.provider ? op.config.providerConsent !== 'codex-account/1' : op.config.providerConsent !== undefined) || (noahModelDigest(binding!.model) && !binding!.modelSha256)) fail('送信確認・モデルの固定版を照合してください。', 400);
        await validateBinding(user, probe.noahExecution!);
        op.bindings ??= [{ version: 1, binding: op.binding, changedAt: Date.parse(job.createdAt) }];
        op.bindingVersion = version + 1; op.binding = binding!;
        op.bindings.push({ version: op.bindingVersion, binding: binding!, changedAt: now(), commandId: input.commandId, previousRevision: input.revision, candidateDigest: input.candidateDigest });
        op.state = 'paused'; op.nextRunAt = null; op.leaseSha256 = undefined; op.error = undefined;
        return save(user, job);
      }
      if (['claim', 'settle', 'reserveModel'].includes(input.action) && (!/^[a-f0-9]{64}$/.test(input.lease || '') || await noahDigest(input.lease!) !== op.leaseSha256)) fail('この運用を担当するhostではありません。', 403);
      if (input.action === 'reserveModel') {
        if (op.state !== 'enabled' || op.config.expiresAt <= now() || !op.active || op.active.jobId !== input.occurrenceId || op.binding.provider) fail('この運用のモデル呼出しを許可できません。',403);
        const active = op.active!;
        const count = input.modelCall, previous = active.reservedModelCalls ?? 0;
        if (!Number.isInteger(count) || count! < 1 || count! > LIMITS.modelCalls || count! > previous + 1) fail('モデル呼出しの順序を照合できません。',400);
        if (count! <= previous) return presentNoahOperation(job);
        if (modelBudgetReached(op)) fail('設定したモデル呼出し上限に達しました。',429);
        // Reserve before dispatch. A response loss or restart never refunds it.
        op.modelBudgetSinceSequence ??= active.sequence;
        active.reservedModelCalls = count;
        op.reservedModelCalls = (op.reservedModelCalls ?? 0) + 1;
        return save(user,job);
      }
      if (['revise', 'archive', 'restore'].includes(input.action)) {
        if (op.active || op.history.at(-1)?.state === 'unknown' || !['paused','blocked','exhausted','archived'].includes(op.state)) fail('停止と結果を確認してから変更してください。');
        if (input.action === 'restore') {
          if (op.state !== 'archived') fail('整理済みの運用ではありません。');
          op.state = 'paused'; op.nextRunAt = null; op.leaseSha256 = undefined;
          return save(user, job, true);
        }
        if (op.state === 'archived') fail('復元してから条件を変更してください。');
        if (input.action === 'archive') { op.state = 'archived'; op.nextRunAt = null; op.leaseSha256 = undefined; }
        else {
          try { parseOperationRequest(input.config, now()); } catch (e) { fail((e as Error).message, 400); }
          const config = input.config!;
          if (config.id !== job.id || config.agentId !== op.config.agentId || config.maxRuns < op.attempts || (op.binding.provider ? config.providerConsent !== 'codex-account/1' : config.providerConsent !== undefined)) fail('同じAgent・累計回数・送信確認を照合してください。', 400);
          if (config.maxModelCalls !== undefined && (op.binding.provider || (op.modelBudgetSinceSequence !== 1 && op.attempts > 0) || config.maxModelCalls < (op.reservedModelCalls ?? 0))) fail('過去の予約数を確認できない運用、Codex、使用済み枠未満への変更はできません。新しい運用を設定してください。',400);
          const version = op.configVersion ?? 1;
          if (version >= 20) fail('条件変更は20版までです。新しい運用を設定してください。', 429);
          op.configs ??= [{ version: 1, config: op.config, changedAt: Date.parse(job.createdAt) }];
          op.configVersion = version + 1; op.configs.push({ version: op.configVersion, config, changedAt: now() }); op.config = config;
          op.state = 'paused'; op.error = undefined; op.nextRunAt = null; op.leaseSha256 = undefined;
          op.eventCursor = config.trigger ? { at: now(), id: '~' } : undefined;
          job.title = `継続運用: ${op.binding.recipe} ${config.prompt.slice(0, 60)}`; job.plan.objective = config.prompt.slice(0, 1000);
        }
        return save(user, job);
      }
      if (op.state === 'archived') fail('整理済みの運用です。復元してから操作してください。');
      if (input.action === 'claim') {
        if (op.state !== 'enabled' || op.active) fail('この運用は新しい仕事を受け付けていません。');
        if (now() >= op.config.expiresAt || op.attempts >= op.config.maxRuns || modelBudgetReached(op)) { op.state = 'exhausted'; op.nextRunAt = null; }
        else {
          if (op.nextRunAt === null || now() < op.nextRunAt) fail('まだ次の予定時刻ではありません。');
          let event: NoahOperationEvent | undefined, prompt: string | undefined;
          if (op.config.trigger) {
            let changed = false;
            for (const source of await store.listNoahEvents(user, op.config.trigger.agentId, op.eventCursor!)) {
              const found = await operationEvent(source, job.id, op.config.trigger.agentId);
              op.eventCursor = { at: source.noahExecution!.completedAt!, id: source.id }; changed = true;
              if (found) { event = found; prompt = operationEventPrompt(op.config.prompt, source); break; }
            }
            if (!event) return changed ? save(user, job) : presentNoahOperation(job);
          }
          const sequence = op.attempts + 1;
          op.active = { reservedModelCalls: 0, jobId: operationRunId(job.id, sequence), sequence, scheduledAt: now(), configVersion: op.configVersion ?? 1, bindingVersion: op.bindingVersion ?? 1, ...(event ? { event, prompt } : {}) }; op.attempts = sequence;
          op.nextRunAt = now() + op.config.intervalSeconds * 1000;
        }
      } else if (input.action === 'settle') { await settle(user, op, false); }
      else if (input.action === 'pause') { op.state = op.active ? 'stopping' : op.history.at(-1)?.state === 'unknown' ? 'blocked' : 'paused'; op.nextRunAt = null; }
      else if (input.action === 'finishPause') {
        if (op.state === 'blocked' && !op.active && op.history.at(-1)?.state === 'unknown') return presentNoahOperation(job);
        if (!['stopping', 'paused'].includes(op.state)) fail('先に運用停止を要求してください。');
        await settle(user, op, true); if (op.state !== 'blocked') op.state = 'paused'; op.nextRunAt = null;
      } else {
        if (op.active || !['paused', 'blocked'].includes(op.state) || op.history.at(-1)?.state === 'unknown') fail('実行結果と停止を確認してから新しい運用を設定してください。');
        if (now() >= op.config.expiresAt || op.attempts >= op.config.maxRuns || modelBudgetReached(op)) fail('期限・実行回数・モデル呼出しの上限です。新しい運用を設定してください。');
        if (!/^[a-f0-9]{64}$/.test(input.lease || '') || canonicalOperationValue(input.binding) !== canonicalOperationValue(op.binding)) fail('同じAgent版・実行環境に接続してください。');
        op.eventCursor = op.config.trigger ? { at: now(), id: '~' } : undefined;
        op.leaseSha256 = await noahDigest(input.lease!); op.state = 'enabled'; op.error = undefined; op.nextRunAt = now() + op.config.intervalSeconds * 1000;
      }
      return save(user, job);
    },
  };
}
