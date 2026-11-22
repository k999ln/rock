export const AGENT_ID = 'd8a4be55-6864-4dae-9a6e-659bc18cc5e5';
export const MANIFEST_SHA256 = '806066178fd7307637fa5e05ff2c38161bd66bfc32659da77090bcedad3bf99b';
export const OWNER_SCOPE = 'owner-v1:b31c3ca3da8f14edd901298a63aad0ba559b0f9d23f959870056bd31a015a865';
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function exactKeys(input, keys) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length !== keys.length || keys.some(k => !Object.hasOwn(input, k))) throw new HttpError(400, '入力項目を確認してください。');
}
export function validateStart(input) {
  exactKeys(input, ['requestId', 'text', 'intervalSeconds']);
  if (!UUID.test(input.requestId) || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 || ![60, 300, 900].includes(input.intervalSeconds)) throw new HttpError(400, '入力は1〜4000文字、間隔は1・5・15分から選んでください。');
}
export function transform(text) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean), unique = [...new Set(lines)];
  return { text: unique.join('\n'), inputLines: lines.length, uniqueLines: unique.length, removedLines: lines.length - unique.length };
}
export async function sha256(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export const newState = () => ({ version: 1, operation: null, runs: [], starts: {} });
export function start(state, input, now, fingerprint) {
  validateStart(input);
  if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('Missing input fingerprint');
  if (Object.hasOwn(state.starts, input.requestId)) {
    if (state.starts[input.requestId] !== fingerprint || state.operation?.id !== input.requestId) throw new HttpError(409, 'この開始IDは使用済みです。現在の状態を確認してください。');
    return false;
  }
  if (state.operation?.state === 'running') throw new HttpError(409, 'すでに運用中です。設定を変えるには停止してください。');
  if (Object.keys(state.starts).length >= 1000) throw new HttpError(429, '開始履歴の上限です。管理者による確認が必要です。');
  state.starts[input.requestId] = fingerprint;
  state.operation = { id: input.requestId, state: 'running', text: input.text, intervalSeconds: input.intervalSeconds, startedAt: now, stoppedAt: null, nextRunAt: now + 1, succeededCount: 0 };
  return true;
}
export function tick(state, now) {
  const op = state.operation;
  if (op?.state !== 'running' || op.nextRunAt > now) return false;
  const sequence = op.succeededCount + 1;
  if (!Number.isSafeInteger(sequence)) throw new Error('Sequence limit');
  const scheduledAt = op.nextRunAt;
  state.runs.push({ id: `${op.id}:${sequence}`, operationId: op.id, sequence, scheduledAt, completedAt: now, result: transform(op.text) });
  state.runs = state.runs.slice(-20);
  op.succeededCount = sequence;
  op.nextRunAt = now + op.intervalSeconds * 1000;
  return true;
}
export function view(state, now) {
  return { agentId: AGENT_ID, manifestSha256: MANIFEST_SHA256, operation: state.operation, runs: state.runs, serverTime: now,
    health: state.operation?.state === 'running' && now > state.operation.nextRunAt + 90000 ? 'delayed' : 'ok' };
}
