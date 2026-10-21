import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { a2aBrokerDeviceStore } from '@/lib/a2a-broker-device-store';
import {
  ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
  verifyAndroidKeyAttestation,
} from '@/lib/android-key-attestation-client';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' },
});
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE = 'dev.rock.automation';
const MAX_BODY_BYTES = 256 * 1024;
const CHALLENGE_LIFETIME_MS = 5 * 60_000;

type Config = {
  ANDROID_ATTESTATION_VERIFIER_URL?: string;
  ANDROID_ATTESTATION_VERIFIER_TOKEN?: string;
  ANDROID_ATTESTATION_VERIFIER_COMMIT?: string;
  ANDROID_ATTESTATION_VERIFIER?: { fetch: typeof fetch };
};

async function readBody(request: Request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json')
    throw new Error('CONTENT_TYPE');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BODY_INVALID');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('BODY_INVALID');
  return input as Record<string, unknown>;
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'sign_in_required' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
  if (error instanceof Error && error.message === 'A2A_BROKER_CHALLENGE_RATE_LIMIT') return json({ error: 'enrollment_rate_limited' }, 429);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_NOT_CONFIGURED') return json({ error: 'device_attestation_verifier_not_configured' }, 503);
  if (error instanceof Error && error.message === 'ATTESTATION_REJECTED') return json({ error: 'device_attestation_rejected' }, 422);
  if (error instanceof Error && error.message === 'ATTESTATION_RESULT_INVALID') return json({ error: 'device_attestation_result_invalid' }, 502);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_PROTOCOL_ERROR') return json({ error: 'device_attestation_verifier_protocol_error' }, 502);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_UNAVAILABLE') return json({ error: 'device_attestation_verifier_unavailable' }, 503);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ error: 'request_too_large' }, 413);
  if (error instanceof SyntaxError || (error instanceof Error && ['CONTENT_TYPE', 'BODY_INVALID'].includes(error.message)))
    return json({ error: 'invalid_request' }, 400);
  return json({ error: 'broker_device_unavailable' }, 503);
}

async function digestHex(bytes: Uint8Array) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export async function GET(request: Request) {
  try {
    const owner = await requestRockstarUser(request, database());
    return json({ devices: await a2aBrokerDeviceStore(database()).list(owner) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get('Origin');
    if (origin && origin !== new URL(request.url).origin) return json({ error: 'origin_rejected' }, 403);
    const owner = await requestRockstarUser(request, database());
    const input = await readBody(request);
    const store = a2aBrokerDeviceStore(database());
    const now = Date.now();

    if (input.action === 'challenge' && Object.keys(input).length === 2 &&
        typeof input.deviceRef === 'string' && uuid.test(input.deviceRef)) {
      const challengeNonce = nonce();
      const challengeId = crypto.randomUUID();
      const expiresAt = now + CHALLENGE_LIFETIME_MS;
      await store.createChallenge({
        id: challengeId,
        ownerUserId: owner,
        deviceRef: input.deviceRef,
        nonceSha256: await digestHex(new TextEncoder().encode(challengeNonce)),
        createdAt: now,
        expiresAt,
        consumedAt: null,
      }, now);
      return json({ challengeId, challengeNonce, deviceRef: input.deviceRef, expiresAt }, 201);
    }

    if (input.action === 'register' && Object.keys(input).length === 4 &&
      typeof input.challengeId === 'string' && uuid.test(input.challengeId) &&
      typeof input.challengeNonce === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.challengeNonce) &&
      Array.isArray(input.certificateChainDerBase64Url)) {
      const accepted = await store.challengeById(owner, input.challengeId);
      const challengeNonceSha256 = await digestHex(new TextEncoder().encode(input.challengeNonce));
      if (!accepted || accepted.consumedAt !== null || accepted.expiresAt <= now ||
          accepted.nonceSha256 !== challengeNonceSha256)
        return json({ error: 'challenge_invalid_or_expired' }, 409);
      const chain = input.certificateChainDerBase64Url;
      const config = env as unknown as Config;
      const attested = await verifyAndroidKeyAttestation({
        endpoint: config.ANDROID_ATTESTATION_VERIFIER_URL,
        token: config.ANDROID_ATTESTATION_VERIFIER_TOKEN,
        expectedCommit: config.ANDROID_ATTESTATION_VERIFIER_COMMIT ?? ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
      }, {
        challengeId: input.challengeId,
        challengeNonce: input.challengeNonce,
        packageName: PACKAGE,
        certificateChainDerBase64Url: chain as string[],
      }, config.ANDROID_ATTESTATION_VERIFIER
        ? (url, init) => config.ANDROID_ATTESTATION_VERIFIER!.fetch(new Request(url, init))
        : fetch);
      const state = await store.enroll({
        challenge: accepted,
        challengeNonceSha256,
        attestedKey: attested,
        now,
      });
      if (state === 'key_conflict') return json({ error: 'broker_key_already_bound' }, 409);
      if (state === 'challenge_unavailable') return json({ error: 'challenge_invalid_or_expired' }, 409);
      return json({ state, authorityId: attested.authorityId, deviceRef: accepted.deviceRef,
        keyId: attested.keyId, algorithm: 'ES256' }, state === 'registered' ? 201 : 200);
    }

    if (input.action === 'revoke' && Object.keys(input).length === 3 &&
        typeof input.deviceRef === 'string' && uuid.test(input.deviceRef) &&
        typeof input.keyId === 'string' && /^[a-f0-9]{64}$/.test(input.keyId)) {
      const revoked = await store.revoke(owner, input.deviceRef, input.keyId, now);
      return revoked ? json({ revoked: true, deviceRef: input.deviceRef, keyId: input.keyId })
        : json({ error: 'active_broker_key_not_found' }, 404);
    }
    return json({ error: 'invalid_request' }, 400);
  } catch (error) { return errorResponse(error); }
}
