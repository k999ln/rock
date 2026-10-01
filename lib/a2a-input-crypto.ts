export type EncryptedA2AInput = {
  ciphertext: string;
  nonce: string;
  inputSha256: string;
  keyVersion: 'aes-256-gcm-v1';
};

export type EncryptedA2AArtifact = {
  ciphertext: string;
  nonce: string;
  artifactSha256: string;
  keyVersion: 'aes-256-gcm-v1';
};

const digestPattern = /^[a-f0-9]{64}$/i;
const keyVersion = 'aes-256-gcm-v1' as const;

function keyBytes(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error('A2A_INPUT_ENCRYPTION_KEY_INVALID');
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
}

function base64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function aad(ownerUserId: string, delegationId: string, inputSha256: string) {
  return new TextEncoder().encode(
    `rockstar-a2a-input-v1\0${ownerUserId}\0${delegationId}\0${inputSha256.toLowerCase()}`,
  );
}

function artifactAad(
  ownerUserId: string,
  delegationId: string,
  remoteTaskId: string,
  artifactSha256: string,
) {
  return new TextEncoder().encode(
    `rockstar-a2a-artifact-v1\0${ownerUserId}\0${delegationId}\0${remoteTaskId}\0${artifactSha256.toLowerCase()}`,
  );
}

async function importKey(value: string) {
  return crypto.subtle.importKey('raw', keyBytes(value), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptA2AInput(
  message: string,
  keyHex: string,
  ownerUserId: string,
  delegationId: string,
  inputSha256: string,
): Promise<EncryptedA2AInput> {
  if (!digestPattern.test(inputSha256) || !message)
    throw new Error('A2A_INPUT_ENCRYPTION_INPUT_INVALID');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: aad(ownerUserId, delegationId, inputSha256),
      tagLength: 128,
    },
    await importKey(keyHex),
    new TextEncoder().encode(message),
  );
  return {
    ciphertext: base64(new Uint8Array(encrypted)),
    nonce: base64(nonce),
    inputSha256: inputSha256.toLowerCase(),
    keyVersion,
  };
}

export async function decryptA2AInput(
  input: EncryptedA2AInput,
  keyHex: string,
  ownerUserId: string,
  delegationId: string,
) {
  if (
    input.keyVersion !== keyVersion ||
    !digestPattern.test(input.inputSha256)
  )
    throw new Error('A2A_INPUT_CIPHERTEXT_INVALID');
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(input.nonce),
        additionalData: aad(ownerUserId, delegationId, input.inputSha256),
        tagLength: 128,
      },
      await importKey(keyHex),
      fromBase64(input.ciphertext),
    );
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new Error('A2A_INPUT_DECRYPTION_FAILED');
  }
}

export async function encryptA2AArtifact(
  content: string,
  keyHex: string,
  ownerUserId: string,
  delegationId: string,
  remoteTaskId: string,
): Promise<EncryptedA2AArtifact> {
  const bytes = new TextEncoder().encode(content);
  if (!content || bytes.byteLength > 32_768 || remoteTaskId.length > 256)
    throw new Error('A2A_ARTIFACT_INPUT_INVALID');
  const artifactSha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
      additionalData: artifactAad(
        ownerUserId,
        delegationId,
        remoteTaskId,
        artifactSha256,
      ),
      tagLength: 128,
    },
    await importKey(keyHex),
    bytes,
  );
  return {
    ciphertext: base64(new Uint8Array(encrypted)),
    nonce: base64(nonce),
    artifactSha256,
    keyVersion,
  };
}

export async function decryptA2AArtifact(
  artifact: EncryptedA2AArtifact,
  keyHex: string,
  ownerUserId: string,
  delegationId: string,
  remoteTaskId: string,
) {
  if (
    artifact.keyVersion !== keyVersion ||
    !digestPattern.test(artifact.artifactSha256) ||
    remoteTaskId.length > 256
  )
    throw new Error('A2A_ARTIFACT_CIPHERTEXT_INVALID');
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(artifact.nonce),
        additionalData: artifactAad(
          ownerUserId,
          delegationId,
          remoteTaskId,
          artifact.artifactSha256,
        ),
        tagLength: 128,
      },
      await importKey(keyHex),
      fromBase64(artifact.ciphertext),
    );
    const bytes = new Uint8Array(plaintext);
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const actual = Array.from(digest, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    if (actual !== artifact.artifactSha256.toLowerCase())
      throw new Error('A2A_ARTIFACT_HASH_MISMATCH');
    return content;
  } catch {
    throw new Error('A2A_ARTIFACT_DECRYPTION_FAILED');
  }
}
