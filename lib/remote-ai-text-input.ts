import type { RemoteAiTextIntent } from './remote-ai-text-pricing.ts';

export type EncryptedRemoteAiTextInput = {
  ciphertext: string;
  nonce: string;
  inputSha256: string;
  keyVersion: 'aes-256-gcm-v1';
};

function keyBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) throw new Error('REMOTE_AI_TEXT_INPUT_KEY_INVALID');
  return Uint8Array.from(value.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
}
function base64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}
function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
function aad(ownerId: string, executionId: string, inputSha256: string) {
  return new TextEncoder().encode(`rockstar-remote-ai-text-input-v1\0${ownerId}\0${executionId}\0${inputSha256}`);
}
async function digest(bytes: Uint8Array) {
  const value = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer as ArrayBuffer));
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function importKey(value: string) {
  return crypto.subtle.importKey('raw', Uint8Array.from(keyBytes(value)).buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypt owner-approved cloud prompt material before it enters the durable worker queue. */
export async function encryptRemoteAiTextInput(
  intent: RemoteAiTextIntent,
  keyHex: string,
  ownerId: string,
  executionId: string,
): Promise<EncryptedRemoteAiTextInput> {
  const bytes = new TextEncoder().encode(JSON.stringify({
    ownerId: intent.ownerId, requestId: intent.requestId, model: intent.model,
    prompt: intent.prompt, system: intent.system ?? null,
    maxOutputTokens: intent.maxOutputTokens, maximumBudgetMinor: intent.maximumBudgetMinor,
  }));
  if (bytes.byteLength > 28_000 || ownerId !== intent.ownerId || !executionId)
    throw new Error('REMOTE_AI_TEXT_INPUT_INVALID');
  const inputSha256 = await digest(bytes);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv: Uint8Array.from(nonce).buffer as ArrayBuffer,
    additionalData: Uint8Array.from(aad(ownerId, executionId, inputSha256)).buffer as ArrayBuffer, tagLength: 128,
  }, await importKey(keyHex), bytes);
  return { ciphertext: base64(new Uint8Array(ciphertext)), nonce: base64(nonce), inputSha256, keyVersion: 'aes-256-gcm-v1' };
}

export async function decryptRemoteAiTextInput(
  encrypted: EncryptedRemoteAiTextInput,
  keyHex: string,
  ownerId: string,
  executionId: string,
): Promise<RemoteAiTextIntent> {
  if (encrypted.keyVersion !== 'aes-256-gcm-v1' || !/^[a-f0-9]{64}$/.test(encrypted.inputSha256))
    throw new Error('REMOTE_AI_TEXT_INPUT_INVALID');
  try {
    const clear = await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: Uint8Array.from(fromBase64(encrypted.nonce)).buffer as ArrayBuffer,
      additionalData: Uint8Array.from(aad(ownerId, executionId, encrypted.inputSha256)).buffer as ArrayBuffer, tagLength: 128,
    }, await importKey(keyHex), fromBase64(encrypted.ciphertext));
    const bytes = new Uint8Array(clear);
    if (await digest(bytes) !== encrypted.inputSha256) throw new Error('REMOTE_AI_TEXT_INPUT_HASH_MISMATCH');
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
    if (value.ownerId !== ownerId || typeof value.requestId !== 'string' || typeof value.model !== 'string' ||
      typeof value.prompt !== 'string' || !(value.system === null || typeof value.system === 'string') ||
      !Number.isSafeInteger(value.maxOutputTokens) || !Number.isSafeInteger(value.maximumBudgetMinor))
      throw new Error('REMOTE_AI_TEXT_INPUT_INVALID');
    return {
      ownerId, requestId: value.requestId, model: value.model, prompt: value.prompt,
      ...(typeof value.system === 'string' ? { system: value.system } : {}),
      maxOutputTokens: value.maxOutputTokens as number, maximumBudgetMinor: value.maximumBudgetMinor as number,
    };
  } catch { throw new Error('REMOTE_AI_TEXT_INPUT_DECRYPTION_FAILED'); }
}
