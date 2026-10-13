import {
  encryptBackupEnvelope,
  decryptBackupEnvelope,
} from './backup-crypto.ts';
import { ADDONS_STORAGE_KEY } from './rockstar-addons.ts';
export const SYSTEM_BACKUP_FORMAT = 'rockstaros-device-backup/1';
export const HOME_PREFERENCES_KEY = 'rockstaros.home.preferences.v1';
const MAX_BACKUP_BYTES = 256 * 1024;
const ALLOWED_PREFERENCE_KEYS = new Set([
  HOME_PREFERENCES_KEY,
  ADDONS_STORAGE_KEY,
]);

type DeviceBackupPayload = {
  format: typeof SYSTEM_BACKUP_FORMAT;
  createdAt: string;
  records: Record<string, string>;
};

function sanitizeRecords(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('バックアップに端末設定がありません。');
  const records: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!ALLOWED_PREFERENCE_KEYS.has(key) || typeof entry !== 'string')
      throw new Error('許可されていない端末設定が含まれています。');
    if (key.length > 128 || entry.length > MAX_BACKUP_BYTES)
      throw new Error('バックアップ内の設定が大きすぎます。');
    records[key] = entry;
  }
  return records;
}

export function collectDevicePreferences(storage: Storage) {
  const records: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key || !ALLOWED_PREFERENCE_KEYS.has(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) records[key] = value;
  }
  return sanitizeRecords(records);
}

export async function encryptDeviceBackup(
  records: Record<string, string>,
  passphrase: string,
  createdAt = new Date().toISOString(),
) {
  const payload: DeviceBackupPayload = {
    format: SYSTEM_BACKUP_FORMAT,
    createdAt,
    records: sanitizeRecords(records),
  };
  return encryptBackupEnvelope(
    new TextEncoder().encode(JSON.stringify(payload)),
    passphrase,
    SYSTEM_BACKUP_FORMAT,
    MAX_BACKUP_BYTES,
  );
}

export async function decryptDeviceBackup(source: string, passphrase: string) {
  const plaintext = await decryptBackupEnvelope(
    source,
    passphrase,
    SYSTEM_BACKUP_FORMAT,
    MAX_BACKUP_BYTES,
  );
  let payload: DeviceBackupPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('復号したバックアップを読み取れません。');
  }
  if (
    payload.format !== SYSTEM_BACKUP_FORMAT ||
    typeof payload.createdAt !== 'string'
  )
    throw new Error('バックアップの内容を確認できません。');
  return {
    format: SYSTEM_BACKUP_FORMAT,
    createdAt: payload.createdAt,
    records: sanitizeRecords(payload.records),
  };
}

type PreferenceSnapshot = Readonly<Record<string, string | null>>;
// Recovery is confined to this tab's Storage instance. No new persistent key,
// login credential, Wallet data or server record is introduced.
const pendingPreferenceRecovery = new WeakMap<Storage, PreferenceSnapshot>();

export class DevicePreferenceRestoreError extends Error {
  readonly recoveryPending: boolean;
  readonly originalRecords: PreferenceSnapshot;
  constructor(
    message: string,
    originalRecords: PreferenceSnapshot,
    recoveryPending: boolean,
  ) {
    super(message);
    this.name = 'DevicePreferenceRestoreError';
    this.originalRecords = originalRecords;
    // Retry can access the snapshot explicitly; ordinary error JSON must not
    // accidentally disclose a user's saved preference values.
    Object.defineProperty(this, 'originalRecords', { enumerable: false });
    this.recoveryPending = recoveryPending;
  }
}

function preferenceSnapshot(storage: Storage): PreferenceSnapshot {
  const records: Record<string, string | null> = {};
  try {
    for (const key of ALLOWED_PREFERENCE_KEYS) {
      const value = storage.getItem(key);
      if (value !== null && typeof value !== 'string')
        throw new Error('invalid Storage value');
      records[key] = value;
    }
  } catch {
    throw new Error(
      '現在の端末設定を読み取れないため変更を始めていません。保存先の状態を確認して再試行してください。',
    );
  }
  return Object.freeze(records);
}

function writePreference(storage: Storage, key: string, value: string | null) {
  if (value === null) storage.removeItem(key);
  else storage.setItem(key, value);
}

function rollBackPreferences(storage: Storage, snapshot: PreferenceSnapshot) {
  let complete = true;
  for (const key of ALLOWED_PREFERENCE_KEYS) {
    try {
      if (storage.getItem(key) !== snapshot[key])
        writePreference(storage, key, snapshot[key]);
      if (storage.getItem(key) !== snapshot[key]) complete = false;
    } catch {
      complete = false;
    }
  }
  return complete;
}

/** Recover an interrupted restore in this tab before accepting another restore.
 * Storage has no cross-key transaction or cross-tab CAS; callers must not claim
 * those guarantees. Keep the original snapshot when Storage still refuses it. */
export function recoverDevicePreferences(storage: Storage): boolean {
  const original = pendingPreferenceRecovery.get(storage);
  if (!original) return false;
  if (!rollBackPreferences(storage, original))
    throw new DevicePreferenceRestoreError(
      '元の端末設定をまだ復旧できません。この画面を閉じず、保存先の空き容量・アクセスを確認して再試行してください。',
      original,
      true,
    );
  pendingPreferenceRecovery.delete(storage);
  return true;
}

function replacePreferences(
  storage: Storage,
  next: PreferenceSnapshot,
  operation: 'restore' | 'reset',
) {
  const original = preferenceSnapshot(storage);
  const pendingOriginal = pendingPreferenceRecovery.get(storage);
  try {
    for (const key of ALLOWED_PREFERENCE_KEYS)
      if (original[key] !== next[key]) writePreference(storage, key, next[key]);
  } catch {
    const recovered = rollBackPreferences(storage, original);
    const protectedOriginal = pendingOriginal ?? original;
    if (!recovered || pendingOriginal)
      pendingPreferenceRecovery.set(storage, protectedOriginal);
    else pendingPreferenceRecovery.delete(storage);
    const pending = !recovered || Boolean(pendingOriginal);
    const message = pending
      ? '端末設定の変更と元設定の復旧が完了していません。元設定はこの画面で保持しています。画面を閉じず、保存先の空き容量・アクセスを確認して再試行してください。'
      : `${operation === 'restore' ? 'バックアップの復元' : '端末設定の初期化'}に失敗したため、変更前の設定に戻しました。保存先の状態を確認して再試行してください。`;
    throw new DevicePreferenceRestoreError(message, protectedOriginal, pending);
  }
  // An explicit successful reset is final: never revive an older failed restore.
  pendingPreferenceRecovery.delete(storage);
}

export function restoreDevicePreferences(
  storage: Storage,
  records: Record<string, string>,
) {
  // Validate every record before touching even an interrupted recovery snapshot.
  const safe = sanitizeRecords(records);
  recoverDevicePreferences(storage);
  const next = Object.freeze(
    Object.fromEntries(
      [...ALLOWED_PREFERENCE_KEYS].map((key) => [key, safe[key] ?? null]),
    ),
  );
  replacePreferences(storage, next, 'restore');
}

export function resetDevicePreferences(storage: Storage) {
  const next = Object.freeze(
    Object.fromEntries([...ALLOWED_PREFERENCE_KEYS].map((key) => [key, null])),
  );
  replacePreferences(storage, next, 'reset');
}
