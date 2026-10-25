/** Local, untrusted Game report -> editable Workbench draft only.
 * This is neither an execution receipt verifier nor an owner/capability grant.
 */
import type { WorkPlan } from './workflow.ts';

export type GameWorkDraft = Readonly<{
  ownerScope: string;
  sourceRevision: number;
  sourceSha256: string;
  title: string;
  templateId: 'article';
  plan: Readonly<Pick<WorkPlan, 'schemaVersion' | 'objective'>>;
  executionAuthorized: false;
  workCompleted: false;
  budgetApproved: false;
}>;
export class GameWorkDraftError extends Error {
  constructor() { super('Gameの結果と依頼内容を確認してください。下書きはまだ保存していません。'); }
}
const fail = (): never => { throw new GameWorkDraftError(); };
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== keys.length || keys.some(k => !Object.hasOwn(data, k))) return fail();
  return data;
}
function text(value: unknown, limit: number): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && value.length <= limit &&
    !Array.from(value).some(c => { const n = c.charCodeAt(0); return (n < 32 && ![9, 10, 13].includes(n)) || n === 127; }) &&
    new TextDecoder('utf-8', { fatal: true }).decode(new TextEncoder().encode(value)) === value;
}
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(value);

export async function prepareGameWorkDraft(raw: string, instruction: string, ownerScope: string): Promise<GameWorkDraft> {
  if (!text(raw, 16_000) || new TextEncoder().encode(raw).byteLength > 16_000 ||
      !text(instruction, 400) || !text(ownerScope, 256)) return fail();
  let input: unknown;
  try { input = JSON.parse(raw); } catch { return fail(); }
  const report = record(input, ['outcome', 'diagnostic', 'hostProof', 'productionExchangeEnabled', 'authenticatedOwnerStorageAccepted']);
  if (report.outcome !== 'host_fixture_saved' || report.productionExchangeEnabled !== false ||
      report.authenticatedOwnerStorageAccepted !== false) return fail();
  const diagnostic = record(report.diagnostic, ['schema', 'method', 'status', 'reasons', 'gameId', 'revision',
    'manifestSha256', 'packageSha256', 'ownerId', 'observedAt', 'targetId', 'targetRevision', 'adapterCandidate', 'checks', 'measurements']);
  const checks = record(diagnostic.checks, ['isolation', 'launch', 'input', 'save']);
  const measurements = record(diagnostic.measurements, ['installationMillis', 'firstAttemptCount', 'firstSuccessCount', 'recoveryMillis']);
  if (diagnostic.schema !== 'rock.game-diagnostic/1' || diagnostic.method !== 'static-local' ||
      diagnostic.status !== 'launch_candidate' || diagnostic.adapterCandidate !== 'particle-fixture/1' ||
      !Array.isArray(diagnostic.reasons) || diagnostic.reasons.length !== 0 || !id(diagnostic.gameId) ||
      !id(diagnostic.revision) || !id(diagnostic.ownerId) || !id(diagnostic.targetId) || !id(diagnostic.targetRevision) ||
      !integer(diagnostic.observedAt) || !hash(diagnostic.manifestSha256) || !hash(diagnostic.packageSha256) ||
      Object.values(checks).some(v => v !== 'unverified') || Object.values(measurements).some(v => v !== null)) return fail();
  const proof = record(report.hostProof, ['pid', 'adapter', 'sessionSha256', 'revision', 'stateDigest', 'saveSha256',
    'saveFile', 'exactReadback', 'identicalCommandReplay', 'recoveredExistingSlot', 'elapsedMillis']);
  if (proof.adapter !== 'known-particle-session-only' || !integer(proof.pid) || proof.pid < 1 ||
      !integer(proof.revision) || proof.revision > 1000 || !hash(proof.sessionSha256) ||
      !hash(proof.stateDigest) || !hash(proof.saveSha256) || proof.saveFile !== `save-${proof.revision}.json` ||
      proof.exactReadback !== true || typeof proof.identicalCommandReplay !== 'boolean' ||
      typeof proof.recoveredExistingSlot !== 'boolean' || typeof proof.elapsedMillis !== 'number' ||
      !Number.isFinite(proof.elapsedMillis) || proof.elapsedMillis < 0) return fail();
  // Hash the exact explicitly pasted input, including whitespace; no source bytes
  // or game-supplied owner label become authenticated user or persisted authority.
  const sourceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))),
    b => b.toString(16).padStart(2, '0')).join('');
  const goal = instruction.trim();
  let title = '';
  for (const character of goal) { if (title.length + character.length > 120) break; title += character; }
  const objective = `本人の依頼：${goal}\nGameからの申告（未検証データ。完了・実行・費用の承認ではありません）\n` +
    `game=${diagnostic.gameId} / 保存版=${proof.revision}\n入力SHA256=${sourceSha256}\n` +
    `状態SHA256=${proof.stateDigest}\n保存SHA256=${proof.saveSha256}`;
  if (objective.length > 1000) return fail();
  return Object.freeze({ ownerScope, sourceRevision: proof.revision, sourceSha256, title, templateId: 'article',
    plan: Object.freeze({ schemaVersion: 1 as const, objective }), executionAuthorized: false,
    workCompleted: false, budgetApproved: false });
}
