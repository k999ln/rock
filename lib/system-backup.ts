export const SYSTEM_BACKUP_FORMAT = 'rockstaros-device-backup/1';
export const HOME_PREFERENCES_KEY = 'rockstaros.home.preferences.v1';
const ITERATIONS = 310_000;
const MAX_BACKUP_BYTES = 256 * 1024;
const ALLOWED_PREFERENCE_KEYS = new Set([HOME_PREFERENCES_KEY]);

type DeviceBackupPayload = {
  format: typeof SYSTEM_BACKUP_FORMAT;
  createdAt: string;
  records: Record<string, string>;
};

type EncryptedEnvelope = {
  format: typeof SYSTEM_BACKUP_FORMAT;
  cipher: 'AES-GCM-256';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error('この環境では暗号化バックアップを利用できません。');
  return globalThis.crypto;
}

function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error('バックアップの形式が壊れています。');
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function validatePassphrase(passphrase: string) {
  if (passphrase.length < 10)
    throw new Error('復旧パスフレーズは10文字以上にしてください。');
  if (passphrase.length > 256)
    throw new Error('復旧パスフレーズが長すぎます。');
}

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

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const api = cryptoApi();
  const material = await api.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return api.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: asArrayBuffer(salt),
      iterations: ITERATIONS,
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
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
  validatePassphrase(passphrase);
  const api = cryptoApi();
  const salt = api.getRandomValues(new Uint8Array(16));
  const iv = api.getRandomValues(new Uint8Array(12));
  const payload: DeviceBackupPayload = {
    format: SYSTEM_BACKUP_FORMAT,
    createdAt,
    records: sanitizeRecords(records),
  };
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  if (encoded.byteLength > MAX_BACKUP_BYTES)
    throw new Error('バックアップ対象が大きすぎます。');
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await api.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: new TextEncoder().encode(SYSTEM_BACKUP_FORMAT),
    },
    key,
    encoded,
  );
  const envelope: EncryptedEnvelope = {
    format: SYSTEM_BACKUP_FORMAT,
    cipher: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptDeviceBackup(
  source: string,
  passphrase: string,
) {
  validatePassphrase(passphrase);
  if (new TextEncoder().encode(source).byteLength > MAX_BACKUP_BYTES * 2)
    throw new Error('バックアップファイルが大きすぎます。');
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(source) as EncryptedEnvelope;
  } catch {
    throw new Error('バックアップのJSONを読み取れません。');
  }
  if (
    envelope.format !== SYSTEM_BACKUP_FORMAT ||
    envelope.cipher !== 'AES-GCM-256' ||
    envelope.kdf !== 'PBKDF2-SHA256' ||
    envelope.iterations !== ITERATIONS
  )
    throw new Error('対応していないバックアップ形式です。');
  const api = cryptoApi();
  const salt = decodeBase64(envelope.salt);
  const iv = decodeBase64(envelope.iv);
  if (salt.length !== 16 || iv.length !== 12)
    throw new Error('バックアップの暗号情報が壊れています。');
  const key = await deriveKey(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await api.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: asArrayBuffer(iv),
        additionalData: new TextEncoder().encode(SYSTEM_BACKUP_FORMAT),
      },
      key,
      asArrayBuffer(decodeBase64(envelope.ciphertext)),
    );
  } catch {
    throw new Error('パスフレーズが違うか、バックアップが改ざんされています。');
  }
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
  for (const key of ALLOWED_PREFERENCE_KEYS) storage.removeItem(key);
  for (const [key, value] of Object.entries(safe)) storage.setItem(key, value);
}
