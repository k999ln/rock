import { pendingOwnerStatus } from './pending-owner-intent.ts';
import { readOwnerScope } from './owner-intent.ts';
import { openZemaPrivateStorage } from './zema-private-storage.ts';
import { compositionPayloadFingerprint } from './work-composition.ts';
import { workId, parseWorkCommand, type WorkJob } from './workflow.ts';

type PrivateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type RecoveryLocks = Pick<LockManager, 'request'>;
/** Passive lookup metadata only. This is neither authentication nor a replayable request. */
export type EvePendingRecovery = {
  version: 1; owner: string; jobId: string; operationId: string;
  kind: 'create' | 'composition' | 'command'; revision: number; fingerprint: string;
};
export const EVE_PENDING_RECOVERY_PREFIX = 'rockstaros.eve-pending-recovery.v1:';
const fail = (): never => { throw new Error('同じ操作の確認先を保存・確認できません。ブラウザーの保存設定を確認してください。再送はしていません。'); };
function key(owner: string) { if (!readOwnerScope(owner)) return fail(); return EVE_PENDING_RECOVERY_PREFIX + owner; }
function storage(provided?: PrivateStorage): PrivateStorage {
  try {
    const target = openZemaPrivateStorage(provided ?? window.localStorage);
    return target ?? fail();
  } catch { return fail(); }
}
export function readEvePendingRecovery(value: unknown, owner: string): EvePendingRecovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const record = value as EvePendingRecovery;
  if (Object.keys(record).sort().join(',') !== 'fingerprint,jobId,kind,operationId,owner,revision,version' ||
    record.version !== 1 || !readOwnerScope(record.owner) || pendingOwnerStatus(owner, record.owner) !== 'matching' ||
    !['create', 'composition', 'command'].includes(record.kind) || !Number.isSafeInteger(record.revision) || record.revision < 0 ||
    typeof record.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(record.fingerprint)) return fail();
  try { if (workId(record.jobId) !== record.jobId || workId(record.operationId) !== record.operationId) return fail(); } catch { return fail(); }
  if (record.kind === 'create' && (record.operationId !== record.jobId || record.revision !== 0)) return fail();
  return record;
}
export function loadEvePendingRecovery(owner: string, provided?: PrivateStorage): EvePendingRecovery | null {
  const raw = storage(provided).getItem(key(owner));
  if (raw === null) return null;
  if (raw.length > 1024) return fail();
  try { return readEvePendingRecovery(JSON.parse(raw), owner); } catch { return fail(); }
}
export async function prepareEvePendingRecovery(owner: string, payload: Record<string, unknown>, fingerprint: string): Promise<EvePendingRecovery> {
  const command = payload.command ? parseWorkCommand(payload.command) : null;
  const create = ['create', 'reuse_recipe'].includes(String(payload.action));
  return readEvePendingRecovery({ version: 1, owner, jobId: payload.jobId,
    operationId: create ? payload.jobId : command?.id ?? payload.commandId,
    kind: create ? 'create' : command ? 'command' : 'composition',
    revision: create ? 0 : payload.revision,
    fingerprint: command ? await compositionPayloadFingerprint(command) : fingerprint }, owner);
}
async function mutateExclusively(owner: string, mutate: () => void, providedLocks?: RecoveryLocks): Promise<void> {
  const name = key(owner);
  // localStorage has no cross-context compare-and-set. Serialize every mutation
  // through the origin-wide Web Lock; unsupported contexts must not dispatch.
  const manager = providedLocks ?? (typeof navigator === 'undefined' ? undefined : navigator.locks);
  if (!manager || typeof manager.request !== 'function') return fail();
  let completed = false;
  await manager.request(name, { mode: 'exclusive' }, async (lock) => {
    if (!lock || lock.name !== name || lock.mode !== 'exclusive') return fail();
    mutate();
    completed = true;
  });
  if (!completed) return fail();
}
export async function saveEvePendingRecovery(record: EvePendingRecovery, provided?: PrivateStorage, providedLocks?: RecoveryLocks): Promise<void> {
  const fixed = readEvePendingRecovery({ ...record }, record.owner);
  await mutateExclusively(fixed.owner, () => {
    const target = storage(provided), previous = loadEvePendingRecovery(fixed.owner, target), raw = JSON.stringify(fixed);
    if (previous && JSON.stringify(previous) !== raw) return fail();
    target.setItem(key(fixed.owner), raw);
    if (target.getItem(key(fixed.owner)) !== raw) return fail();
  }, providedLocks);
}
export async function clearEvePendingRecovery(record: EvePendingRecovery, provided?: PrivateStorage, providedLocks?: RecoveryLocks): Promise<void> {
  const fixed = readEvePendingRecovery({ ...record }, record.owner);
  await mutateExclusively(fixed.owner, () => {
    const target = storage(provided), previous = loadEvePendingRecovery(fixed.owner, target);
    if (!previous || JSON.stringify(previous) !== JSON.stringify(fixed)) return fail();
    target.removeItem(key(fixed.owner));
    if (target.getItem(key(fixed.owner)) !== null) return fail();
  }, providedLocks);
}
export async function evePendingRecoveryConfirms(record: EvePendingRecovery, job: WorkJob, owner: string): Promise<boolean> {
  readEvePendingRecovery(record, owner);
  if (job.id !== record.jobId || !job.composition) return false;
  if (record.kind === 'create') return job.composition.creationFingerprint === record.fingerprint;
  if (job.revision <= record.revision) return false;
  if (record.kind === 'composition') return job.composition.operations.some(op => op.id === record.operationId && op.fingerprint === record.fingerprint);
  const event = job.events.find(entry => entry.command.id === record.operationId);
  return Boolean(event && await compositionPayloadFingerprint(parseWorkCommand(event.command)) === record.fingerprint);
}
