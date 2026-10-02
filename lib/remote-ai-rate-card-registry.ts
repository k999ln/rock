import type { RemoteAiRateCardKeyResolver } from './remote-ai-rate-card.ts';

type TrustedRateKey = {
  providerId: string;
  keyId: string;
  publicKeyHex: string;
  status: 'active' | 'revoked';
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

export function trustedRemoteAiRateCardKeyResolver(configuration: unknown): RemoteAiRateCardKeyResolver {
  if (typeof configuration !== 'string' || new TextEncoder().encode(configuration).byteLength > 5_000) return async () => null;
  let values: unknown;
  try { values = JSON.parse(configuration); } catch { return async () => null; }
  if (!Array.isArray(values) || values.length > 128) return async () => null;

  const entries = new Map<string, TrustedRateKey>();
  for (const value of values) {
    if (!isRecord(value) || Object.keys(value).length !== 4 ||
      !safeId(value.providerId) || !safeId(value.keyId) ||
      typeof value.publicKeyHex !== 'string' || !/^[a-f0-9]{64}$/i.test(value.publicKeyHex) ||
      (value.status !== 'active' && value.status !== 'revoked')) return async () => null;
    const key = `${value.providerId}\0${value.keyId}`;
    if (entries.has(key)) return async () => null;
    entries.set(key, value as TrustedRateKey);
  }

  return async ({ providerId, keyId }) => {
    const entry = entries.get(`${providerId}\0${keyId}`);
    return entry?.status === 'active'
      ? Uint8Array.from(entry.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16))
      : null;
  };
}
