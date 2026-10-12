import { encryptBackupEnvelope, decryptBackupEnvelope } from './backup-crypto.ts';
import { ADDONS_STORAGE_KEY } from './rockstar-addons.ts';
export const SYSTEM_BACKUP_FORMAT = 'rockstaros-device-backup/1';
export const HOME_PREFERENCES_KEY = 'rockstaros.home.preferences.v1';
const MAX_BACKUP_BYTES = 256 * 1024;
const ALLOWED_PREFERENCE_KEYS = new Set([HOME_PREFERENCES_KEY, ADDONS_STORAGE_KEY]);

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


export async function encryptDeviceBackup(records: Record<string, string>, passphrase: string, createdAt = new Date().toISOString()) {
  const payload: DeviceBackupPayload = { format: SYSTEM_BACKUP_FORMAT, createdAt, records: sanitizeRecords(records) };
  return encryptBackupEnvelope(new TextEncoder().encode(JSON.stringify(payload)), passphrase, SYSTEM_BACKUP_FORMAT, MAX_BACKUP_BYTES);
}

export async function decryptDeviceBackup(source: string, passphrase: string) {
  const plaintext = await decryptBackupEnvelope(source, passphrase, SYSTEM_BACKUP_FORMAT, MAX_BACKUP_BYTES);
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

export function restoreDevicePreferences(
  storage: Storage,
  records: Record<string, string>,
) {
  const safe = sanitizeRecords(records);
  resetDevicePreferences(storage);
  for (const [key, value] of Object.entries(safe)) storage.setItem(key, value);
}

export function resetDevicePreferences(storage: Storage) {
  for (const key of ALLOWED_PREFERENCE_KEYS) storage.removeItem(key);
}
