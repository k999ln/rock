// Shared encrypted envelope; each caller supplies its own fixed format and byte limit.
const ITERATIONS = 310_000;
type EncryptedEnvelope = {
  format: string; cipher: 'AES-GCM-256'; kdf: 'PBKDF2-SHA256'; iterations: number;
  salt: string; iv: string; ciphertext: string;
};
function cryptoApi() {
  if (!globalThis.crypto?.subtle)
    throw new Error('この環境では暗号化バックアップを利用できません。');
  return globalThis.crypto;
}

export function encodeBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodeBase64(value: string) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
    throw new Error('バックアップの形式が壊れています。');
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

export async function encryptBackupEnvelope(encoded: Uint8Array, passphrase: string, format: string, maxBytes: number) {
  validatePassphrase(passphrase);
  if (encoded.byteLength > maxBytes) throw new Error('バックアップ対象が大きすぎます。');
  const api = cryptoApi();
  const salt = api.getRandomValues(new Uint8Array(16));
  const iv = api.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await api.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: asArrayBuffer(iv),
      additionalData: new TextEncoder().encode(format),
    },
    key,
    asArrayBuffer(encoded),
  );
  const envelope: EncryptedEnvelope = {
    format: format,
    cipher: 'AES-GCM-256',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope, null, 2);
}

export async function decryptBackupEnvelope(source: string, passphrase: string, format: string, maxBytes: number) {
  validatePassphrase(passphrase);
  if (new TextEncoder().encode(source).byteLength > maxBytes * 2)
    throw new Error('バックアップファイルが大きすぎます。');
  let envelope: EncryptedEnvelope;
  try {
    envelope = JSON.parse(source) as EncryptedEnvelope;
  } catch {
    throw new Error('バックアップのJSONを読み取れません。');
  }
  if (
    !envelope || typeof envelope !== 'object' ||
    envelope.format !== format ||
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
        additionalData: new TextEncoder().encode(format),
      },
      key,
      asArrayBuffer(decodeBase64(envelope.ciphertext)),
    );
  } catch {
    throw new Error('パスフレーズが違うか、バックアップが改ざんされています。');
  }
  if (plaintext.byteLength > maxBytes) throw new Error('バックアップ対象が大きすぎます。');
  return new Uint8Array(plaintext);
}
