export const OPERATION_INTERVALS = [60, 300, 900, 3600];
export const OPERATION_STATES = ['enabled', 'paused', 'stopping', 'blocked', 'exhausted', 'archived'];
export const OPERATION_CONFIRMATION = 'noah-operation/1';
export const OPERATION_RUNTIME_CONFIRMATION = 'noah-operation-runtime/1';
export const operationUuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);
export function canonicalOperationValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalOperationValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).filter(k => value[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalOperationValue(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function operationBinding(value) {
  return Object.fromEntries(['agentId', 'recipe', 'version', 'image', 'model', 'modelSha256', 'source', 'release', 'invite', 'provider'].filter(k => value[k] !== undefined).map(k => [k, value[k]]));
}
export function parseOperationRuntimeUpdate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
    Object.keys(input).some(k => !['revision', 'commandId', 'candidateDigest', 'confirmation'].includes(k)) ||
    !Number.isSafeInteger(input.revision) || input.revision < 0 || !operationUuid(input.commandId) ||
    !/^[a-f0-9]{64}$/.test(input.candidateDigest || '') || input.confirmation !== OPERATION_RUNTIME_CONFIRMATION)
    throw new Error('変更前の版・候補・実行環境の確認を照合してください。');
  return input;
}
export function operationRuntimeReplay(op, input) {
  const previous = op.bindings?.find(b => b.commandId === input.commandId);
  if (!previous) return false;
  if (previous.candidateDigest !== input.candidateDigest || previous.previousRevision !== input.revision)
    throw new Error('同じ操作IDの内容は変更できません。');
  return true;
}
export function operationRuntimeEditable(op) {
  return !op.active && op.history.at(-1)?.state !== 'unknown' && ['paused', 'blocked', 'exhausted'].includes(op.state);
}
export function operationRunId(id, sequence) {
  // A parent UUID owns a non-overlapping deterministic sequence namespace.
  // The persisted parent claim, not this ID alone, authorizes the run.
  if (!operationUuid(id) || !Number.isInteger(sequence) || sequence < 1 || sequence > 100) throw new Error('Invalid operation occurrence');
  return `${id.slice(0, 24)}${(BigInt(`0x${id.slice(24)}`) ^ BigInt(sequence)).toString(16).padStart(12, '0')}`;
}
export function parseOperationRequest(input, now = Date.now()) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['id', 'agentId', 'prompt', 'providerConsent', 'intervalSeconds', 'maxRuns', 'expiresAt', 'timeZone', 'confirmation', 'trigger', 'maxModelCalls'].includes(k)) ||
    !operationUuid(input.id) || typeof input.agentId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(input.agentId) || typeof input.prompt !== 'string' || !input.prompt.trim() || new TextEncoder().encode(input.prompt).length > (input.trigger ? 6000 : 12000) ||
    !OPERATION_INTERVALS.includes(input.intervalSeconds) || !Number.isInteger(input.maxRuns) || input.maxRuns < 1 || input.maxRuns > 100 ||
    !Number.isSafeInteger(input.expiresAt) || input.expiresAt <= now || input.expiresAt > now + 86400000 || input.confirmation !== OPERATION_CONFIRMATION ||
    typeof input.timeZone !== 'string' || input.timeZone.length > 80) throw new Error('依頼・間隔・回数上限・24時間以内の期限を確認してください。');
  if (input.maxModelCalls !== undefined && (!Number.isSafeInteger(input.maxModelCalls) || input.maxModelCalls < 1 || input.maxModelCalls > 1200)) throw new Error('モデル呼出し上限は1から1,200回で指定してください。');
  try { new Intl.DateTimeFormat('ja', { timeZone: input.timeZone }).format(now); } catch { throw new Error('予定のタイムゾーンを確認してください。'); }
  if (input.providerConsent !== undefined && input.providerConsent !== 'codex-account/1') throw new Error('Codexへの繰り返し送信を確認してください。');
  if (input.agentId === 'anicca' && input.prompt.trim().length < 16) throw new Error('Aniccaへの依頼は16文字以上で指定してください。');
  if (input.trigger !== undefined && (!input.trigger || typeof input.trigger !== 'object' || Array.isArray(input.trigger) || Object.keys(input.trigger).length !== 2 ||
    input.trigger.kind !== 'work.returned' || typeof input.trigger.agentId !== 'string' || !/^[a-z0-9-]{1,100}$/.test(input.trigger.agentId) || input.trigger.agentId === input.agentId)) throw new Error('成果を受け取る別のAgentを選んでください。');
  return { ...input };
}
