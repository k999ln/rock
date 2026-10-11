// Sky Compute Grid — lot inputs and outputs at rest.
//
// Every lot payload is stored as AES-256-GCM ciphertext. The associated data
// binds a ciphertext to its owner, order, lot, role and plaintext digest, so a
// row copied to another lot or another owner fails to decrypt.

export const COMPUTE_GRID_KEY_VERSION = 'aes-256-gcm-v1' as const;

export type SealedComputeBytes = {
  ciphertext: string;
  nonce: string;
  keyVersion: typeof COMPUTE_GRID_KEY_VERSION;
};

type Binding = {
  role: 'lot-input' | 'lot-output';
  ownerUserId: string;
  orderId: string;
  lotId: string;
  // Lot outputs are additionally bound to the assignment that produced them.
  assignmentId?: string;
  sha256: string;
};

const digest = /^[a-f0-9]{64}$/;

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function computeGridDataKeyConfigured(keyHex: unknown): keyHex is string {
  return typeof keyHex === 'string' && /^[a-f0-9]{64}$/i.test(keyHex);
}

async function importKey(keyHex: string) {
  if (!computeGridDataKeyConfigured(keyHex)) throw new Error('COMPUTE_GRID_DATA_KEY_INVALID');
  const bytes = Uint8Array.from(keyHex.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function associatedData(binding: Binding) {
  if (!digest.test(binding.sha256)) throw new Error('COMPUTE_GRID_SEAL_INPUT_INVALID');
  return new TextEncoder().encode([
    'rockstar-sky-compute-grid-v1', binding.role, binding.ownerUserId, binding.orderId,
    binding.lotId, binding.assignmentId ?? '', binding.sha256,
  ].join('\0'));
}

export async function sha256Hex(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sealComputeBytes(
  plaintext: Uint8Array,
  keyHex: string,
  binding: Binding,
): Promise<SealedComputeBytes> {
  if (plaintext.byteLength < 1 || (await sha256Hex(plaintext)) !== binding.sha256)
    throw new Error('COMPUTE_GRID_SEAL_INPUT_INVALID');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: associatedData(binding), tagLength: 128 },
    await importKey(keyHex),
    new Uint8Array(plaintext).buffer as ArrayBuffer,
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    nonce: toBase64(nonce),
    keyVersion: COMPUTE_GRID_KEY_VERSION,
  };
}

export async function openComputeBytes(
  sealed: { ciphertext: string; nonce: string; keyVersion: string },
  keyHex: string,
  binding: Binding,
) {
  if (sealed.keyVersion !== COMPUTE_GRID_KEY_VERSION) throw new Error('COMPUTE_GRID_CIPHERTEXT_INVALID');
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(sealed.nonce), additionalData: associatedData(binding), tagLength: 128 },
      await importKey(keyHex),
      fromBase64(sealed.ciphertext),
    ));
  } catch {
    throw new Error('COMPUTE_GRID_DECRYPTION_FAILED');
  }
  if ((await sha256Hex(plaintext)) !== binding.sha256) throw new Error('COMPUTE_GRID_DECRYPTION_FAILED');
  return plaintext;
}

export const computeGridBase64 = { encode: toBase64, decode: fromBase64 };
