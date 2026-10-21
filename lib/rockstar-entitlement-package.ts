const MAX_PACKAGE_BYTES = 16_384;
const CLAIM_CODE_PATTERN = /^rsk_[A-Za-z0-9_-]{32,96}$/;

export type RockstarEntitlementPackage = {
  claim: Record<string, unknown>;
  claimCode: string;
};

const HANDOFF_PREFIX = '#rockstar-claim=';

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parse the seller-delivered signed-claim bundle without trusting it; signature verification remains server-side. */
export function parseRockstarEntitlementPackage(value: string): RockstarEntitlementPackage | null {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > MAX_PACKAGE_BYTES) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (!record(parsed) || !record(parsed.claim) || typeof parsed.claimCode !== 'string' ||
    !CLAIM_CODE_PATTERN.test(parsed.claimCode)) return null;
  return { claim: parsed.claim, claimCode: parsed.claimCode };
}

/** Decode an issuer-provided one-time handoff from the URL fragment, which is not sent in HTTP requests. */
export function parseRockstarEntitlementHandoffFragment(fragment: string): RockstarEntitlementPackage | null {
  if (typeof fragment !== 'string' || !fragment.startsWith(HANDOFF_PREFIX) || fragment.length > 32_768) return null;
  const encoded = fragment.slice(HANDOFF_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return parseRockstarEntitlementPackage(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch { return null; }
}

/** Contract helper for trusted sellers constructing https://rockstar.example/connect links. */
export function encodeRockstarEntitlementHandoffFragment(bundle: RockstarEntitlementPackage): string | null {
  const json = JSON.stringify(bundle);
  if (!parseRockstarEntitlementPackage(json)) return null;
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${HANDOFF_PREFIX}${btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`;
}
