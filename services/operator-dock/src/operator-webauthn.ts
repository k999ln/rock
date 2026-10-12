import { OperatorError } from './validation.ts';

export type OperatorCredentialConfig = {
  credentialId: string;
  publicKeySpki: string;
  rpId: string;
  origin: string;
};

export type OperatorAssertion = {
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
};

export type SignedCommandFields = {
  id: string;
  deviceId: string;
  incidentId: string;
  action: string;
  reason: string;
  issuedAt: number;
  notBefore: number;
  expiresAt: number;
};

const encoder = new TextEncoder();

export function decodeBase64Url(value: string, label: string, maximum = 4096) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value))
    throw new OperatorError(`${label}の形式を確認してください。`);
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding);
  } catch {
    throw new OperatorError(`${label}の形式を確認してください。`);
  }
  if (binary.length === 0 || binary.length > maximum)
    throw new OperatorError(`${label}の長さを確認してください。`);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBase64Url(value: Uint8Array) {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function field(name: string, value: string) {
  return `${name}:${encoder.encode(value).byteLength}:${value}\n`;
}

export function canonicalOperatorCommand(command: SignedCommandFields) {
  return encoder.encode(
    'avocadoOS-operator-command/1\n' +
      field('id', command.id) +
      field('deviceId', command.deviceId) +
      field('incidentId', command.incidentId) +
      field('action', command.action) +
      field('reason', command.reason) +
      field('issuedAt', String(command.issuedAt)) +
      field('notBefore', String(command.notBefore)) +
      field('expiresAt', String(command.expiresAt)),
  );
}

export async function commandChallenge(command: SignedCommandFields) {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', canonicalOperatorCommand(command)),
  );
}

function equal(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index++)
    difference |= left[index] ^ right[index];
  return difference === 0;
}

function derInteger(bytes: Uint8Array) {
  if (bytes.byteLength === 0 || bytes.byteLength > 33)
    throw new OperatorError('運営credential署名を確認できません。');
  let value = bytes;
  if (value.byteLength === 33) {
    if (value[0] !== 0) throw new OperatorError('運営credential署名を確認できません。');
    value = value.slice(1);
  }
  if (value.byteLength > 1 && value[0] === 0 && (value[1] & 0x80) === 0)
    throw new OperatorError('運営credential署名を確認できません。');
  const result = new Uint8Array(32);
  result.set(value, 32 - value.byteLength);
  return result;
}

export function ecdsaDerToRaw(der: Uint8Array) {
  let offset = 0;
  const read = () => der[offset++];
  if (read() !== 0x30) throw new OperatorError('運営credential署名を確認できません。');
  const sequenceLength = read();
  if (sequenceLength !== der.byteLength - 2 || sequenceLength >= 0x80)
    throw new OperatorError('運営credential署名を確認できません。');
  if (read() !== 0x02) throw new OperatorError('運営credential署名を確認できません。');
  const rLength = read();
  const r = derInteger(der.slice(offset, offset + rLength));
  offset += rLength;
  if (read() !== 0x02) throw new OperatorError('運営credential署名を確認できません。');
  const sLength = read();
  const s = derInteger(der.slice(offset, offset + sLength));
  offset += sLength;
  if (offset !== der.byteLength)
    throw new OperatorError('運営credential署名を確認できません。');
  const raw = new Uint8Array(64);
  raw.set(r); raw.set(s, 32);
  return raw;
}

export async function verifyOperatorAssertion(
  command: SignedCommandFields,
  assertion: OperatorAssertion,
  config: OperatorCredentialConfig,
) {
  if (!config.credentialId || !config.publicKeySpki || !config.rpId || !config.origin)
    throw new OperatorError('運営hardware credentialが設定されていません。', 503);
  if (assertion.credentialId !== config.credentialId)
    throw new OperatorError('運営hardware credentialが一致しません。', 403);
  const authenticatorData = decodeBase64Url(assertion.authenticatorData, 'authenticator data', 1024);
  const clientDataBytes = decodeBase64Url(assertion.clientDataJSON, 'client data', 4096);
  const signatureDer = decodeBase64Url(assertion.signature, 'credential署名', 256);
  if (authenticatorData.byteLength < 37)
    throw new OperatorError('authenticator dataを確認できません。');
  const rpIdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(config.rpId)));
  if (!equal(authenticatorData.slice(0, 32), rpIdHash) ||
      (authenticatorData[32] & 0x01) === 0 || (authenticatorData[32] & 0x04) === 0)
    throw new OperatorError('hardware credentialの利用者確認に失敗しました。', 403);
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
  try {
    clientData = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(clientDataBytes));
  } catch {
    throw new OperatorError('client dataを確認できません。');
  }
  const challenge = encodeBase64Url(await commandChallenge(command));
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== challenge ||
      clientData.origin !== config.origin || clientData.crossOrigin === true)
    throw new OperatorError('署名対象の緊急命令が一致しません。', 403);
  const clientHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataBytes));
  const signed = new Uint8Array(authenticatorData.byteLength + clientHash.byteLength);
  signed.set(authenticatorData); signed.set(clientHash, authenticatorData.byteLength);
  const publicKey = await crypto.subtle.importKey(
    'spki', decodeBase64Url(config.publicKeySpki, '運営公開鍵', 1024),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'],
  );
  const verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, publicKey,
    ecdsaDerToRaw(signatureDer), signed,
  );
  if (!verified) throw new OperatorError('緊急命令の署名を確認できません。', 403);
  const view = new DataView(authenticatorData.buffer, authenticatorData.byteOffset, authenticatorData.byteLength);
  const signCount = view.getUint32(33, false);
  const payloadSha256 = encodeBase64Url(await commandChallenge(command));
  return { signCount, payloadSha256 };
}
