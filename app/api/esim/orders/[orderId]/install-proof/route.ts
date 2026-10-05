import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import {
  EsimPlanCatalogError,
  selectEsimOrderPricing,
  verifyEsimStarterAgentPack,
} from '@/lib/esim-plan-catalog';
import {
  esimInstallReceiptSigningBytes,
  parseTrustedEsimInstallIssuerKeys,
  trustedEsimInstallIssuerKeyResolver,
  verifyEsimInstallReceipt,
} from '@/lib/esim-install-proof';
import { esimDeviceInstallStore } from '@/lib/esim-device-install-store';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_OPEN_CHALLENGES = 3;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function readBody(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 20_000) throw new Error('BODY_TOO_LARGE');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('BODY_INVALID');
  return value as Record<string, unknown>;
}

async function sha256Hex(value: string | Uint8Array) {
  const input = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const copy = new Uint8Array(input.length);
  copy.set(input);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nonceString(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function errorResponse(error: unknown) {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'unauthorized' }, 401);
  if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'origin_rejected' }, 403);
  if (error instanceof Error && error.message === 'BODY_TOO_LARGE') return json({ error: 'request_too_large' }, 413);
  if (error instanceof SyntaxError || (error instanceof Error && error.message === 'BODY_INVALID'))
    return json({ error: 'invalid_install_proof_request' }, 400);
  if (error instanceof EsimPlanCatalogError) {
    if (error.code === 'CATALOG_NOT_CONFIGURED') return json({ error: 'esim_not_configured' }, 503);
    if (error.code === 'ORDER_NOT_ELIGIBLE' || error.code === 'PLAN_UNAVAILABLE')
      return json({ error: 'order_not_eligible' }, 409);
    if (error.code === 'STARTER_PACK_UNAVAILABLE') return json({ error: 'starter_pack_unavailable' }, 409);
    return json({ error: 'esim_catalog_invalid' }, 503);
  }
  if (error instanceof Error && error.message === 'INSTALL_PROOF_CONFIG')
    return json({ error: 'install_proof_not_configured' }, 503);
  return json({ error: 'install_proof_unavailable' }, 503);
}

async function eligibleBoundOrder(orderId: string, ownerUserId: string) {
  const db = database();
  const row = await db.prepare(`SELECT o.id, o.buyer_user_id AS buyerUserId, o.mode, o.status,
      o.package_key AS packageKey, o.manifest_sha256 AS manifestSha256,
      o.amount_minor AS amountMinor, o.currency, o.refunded_minor AS refundedMinor,
      p.state AS providerState, p.profile_digest AS profileDigest
    FROM sky_commerce_orders o
    JOIN esim_provider_orders p ON p.sky_order_id = o.id AND p.owner_user_id = o.buyer_user_id
    JOIN esim_provider_profile_bindings b ON b.sky_order_id = o.id AND b.owner_user_id = o.buyer_user_id
      AND b.profile_digest = p.profile_digest
    WHERE o.id = ? AND o.buyer_user_id = ? AND o.mode = 'live'
      AND o.status = 'paid' AND o.refunded_minor = 0 AND p.state = 'profile_bound'`)
    .bind(orderId, ownerUserId).first<{
      id: string; buyerUserId: string; mode: string; status: string; packageKey: string;
      manifestSha256: string; amountMinor: number; currency: string; refundedMinor: number;
      providerState: string; profileDigest: string;
    }>();
  if (!row) return null;
  const config = env as unknown as {
    ESIMGO_PLAN_CATALOG_JSON?: string;
    ESIM_INSTALL_RECEIPT_KEYS?: string;
  };
  const pricing = await selectEsimOrderPricing(db, config.ESIMGO_PLAN_CATALOG_JSON, row, ownerUserId);
  const registry = await skyToolPackageStore(db).listRegistry();
  await verifyEsimStarterAgentPack(pricing.plan, registry);
  const trustedKeys = parseTrustedEsimInstallIssuerKeys(config.ESIM_INSTALL_RECEIPT_KEYS);
  if (!trustedKeys || ![...trustedKeys.values()].some((entry) => entry.status === 'active'))
    throw new Error('INSTALL_PROOF_CONFIG');
  return { db, row, resolver: trustedEsimInstallIssuerKeyResolver(config.ESIM_INSTALL_RECEIPT_KEYS) };
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const body = await readBody(request);
    const eligible = await eligibleBoundOrder(orderId, ownerUserId);
    if (!eligible) return json({ error: 'order_not_found' }, 404);

    const store = esimDeviceInstallStore(eligible.db);
    if (body.action === 'challenge') {
      if (Object.keys(body).length !== 2 || typeof body.deviceRef !== 'string' ||
          !/^[A-Za-z0-9._:-]{1,128}$/.test(body.deviceRef))
        return json({ error: 'invalid_install_proof_request' }, 400);
      const existing = await store.receiptByOrder(ownerUserId, orderId);
      if (existing) {
        if (existing.profileDigest === eligible.row.profileDigest && existing.deviceRef === body.deviceRef)
          return json({ state: 'already_verified', deviceInstallState: 'verified_installed_enabled' });
        return json({ error: 'order_already_bound_to_another_device' }, 409);
      }
      const now = Date.now();
      if (await store.activeChallengeCount(ownerUserId, orderId, now) >= MAX_OPEN_CHALLENGES)
        return json({ error: 'too_many_open_challenges' }, 429);
      const nonce = new Uint8Array(32);
      crypto.getRandomValues(nonce);
      const challengeNonce = nonceString(nonce);
      const challengeId = crypto.randomUUID();
      const expiresAt = now + CHALLENGE_TTL_MS;
      await store.createChallenge({
        id: challengeId,
        skyOrderId: orderId,
        ownerUserId,
        profileDigest: eligible.row.profileDigest,
        deviceRef: body.deviceRef,
        nonceSha256: await sha256Hex(challengeNonce),
        createdAt: now,
        expiresAt,
        consumedAt: null,
      });
      return json({ state: 'challenge_issued', challengeId, challengeNonce, expiresAt });
    }

    if (body.action !== 'submit' || Object.keys(body).length !== 4 ||
        typeof body.challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.challengeId) ||
        typeof body.challengeNonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.challengeNonce) ||
        !body.receipt || typeof body.receipt !== 'object' || Array.isArray(body.receipt))
      return json({ error: 'invalid_install_proof_request' }, 400);

    const challenge = await store.challenge(ownerUserId, orderId, body.challengeId);
    if (!challenge || challenge.profileDigest !== eligible.row.profileDigest ||
        challenge.expiresAt <= Date.now() ||
        challenge.nonceSha256 !== await sha256Hex(body.challengeNonce))
      return json({ error: 'install_challenge_invalid_or_expired' }, 409);

    const receipt = await verifyEsimInstallReceipt(body.receipt, {
      ownerUserId,
      orderId,
      profileDigest: eligible.row.profileDigest,
      challengeId: challenge.id,
      challengeNonce: body.challengeNonce,
      deviceRef: challenge.deviceRef,
    }, eligible.resolver);
    if (!receipt) return json({ error: 'install_receipt_invalid' }, 422);

    const receiptSha256 = await sha256Hex(esimInstallReceiptSigningBytes(receipt));
    const state = await store.saveVerifiedReceipt({
      challengeId: challenge.id,
      skyOrderId: orderId,
      ownerUserId,
      profileDigest: receipt.profileDigest,
      deviceRef: receipt.deviceRef,
      issuerId: receipt.issuerId,
      keyId: receipt.keyId,
      receiptSha256,
      challengeNonceSha256: challenge.nonceSha256,
      evidenceSource: receipt.evidenceSource,
      observedAt: receipt.observedAt,
      verifiedAt: Date.now(),
    }, Date.now());
    if (state === 'challenge_unavailable') return json({ error: 'install_challenge_unavailable' }, 409);
    if (state === 'device_conflict') return json({ error: 'order_already_bound_to_another_device' }, 409);
    return json({ state, deviceInstallState: 'verified_installed_enabled' });
  } catch (error) {
    return errorResponse(error);
  }
}
