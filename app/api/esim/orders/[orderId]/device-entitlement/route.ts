import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import {
  EsimPlanCatalogError,
  selectEsimOrderPricing,
  verifyEsimStarterAgentPack,
} from '@/lib/esim-plan-catalog';
import {
  esimDeviceEntitlementSigningBytes,
  hasTrustedEsimDeviceGatewayKey,
  parseTrustedEsimDeviceGatewayKeys,
  trustedEsimDeviceGatewayKeyResolver,
  trustedEsimDeviceGatewayKeyFingerprint,
  verifyEsimDeviceEntitlementReceipt,
} from '@/lib/esim-device-entitlement';
import { hasTrustedEsimInstallIssuerKey } from '@/lib/esim-install-proof';
import { esimDeviceEntitlementStore } from '@/lib/esim-device-entitlement-store';
import {
  ANDROID_KEY_ATTESTATION_AUTHORITY,
  ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT,
} from '@/lib/android-key-attestation-client';
import { activateAttestedEsimDevice } from '@/lib/esim-attested-device-activation';
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
    return json({ error: 'invalid_device_entitlement_request' }, 400);
  if (error instanceof EsimPlanCatalogError) {
    if (error.code === 'CATALOG_NOT_CONFIGURED') return json({ error: 'esim_not_configured' }, 503);
    if (error.code === 'ORDER_NOT_ELIGIBLE' || error.code === 'PLAN_UNAVAILABLE')
      return json({ error: 'order_not_eligible' }, 409);
    if (error.code === 'STARTER_PACK_UNAVAILABLE') return json({ error: 'starter_pack_unavailable' }, 409);
    return json({ error: 'esim_catalog_invalid' }, 503);
  }
  if (error instanceof Error && error.message === 'DEVICE_GATEWAY_CONFIG')
    return json({ error: 'device_gateway_not_configured' }, 503);
  if (error instanceof Error && error.message === 'ATTESTATION_REJECTED')
    return json({ error: 'device_key_attestation_rejected' }, 422);
  if (error instanceof Error && error.message === 'ATTESTATION_REQUEST_INVALID')
    return json({ error: 'invalid_device_key_attestation' }, 400);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_NOT_CONFIGURED')
    return json({ error: 'device_key_attestation_verifier_not_configured' }, 503);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_PROTOCOL_ERROR')
    return json({ error: 'device_key_attestation_upstream_protocol_error' }, 502);
  if (error instanceof Error && error.message === 'ATTESTATION_RESULT_INVALID')
    return json({ error: 'device_key_attestation_upstream_result_invalid' }, 502);
  if (error instanceof Error && error.message === 'ATTESTATION_VERIFIER_UNAVAILABLE')
    return json({ error: 'device_key_attestation_unavailable' }, 503);
  if (error instanceof Error && error.message === 'DEVICE_GATEWAY_KEY_CONFLICT')
    return json({ error: 'device_gateway_key_conflict' }, 409);
  if (error instanceof Error && error.message === 'DEVICE_ENTITLEMENT_RECEIPT_INVALID')
    return json({ error: 'device_entitlement_receipt_invalid' }, 422);
  if (error instanceof Error && error.message === 'DEVICE_KEY_ATTESTATION_RECEIPT_MISMATCH')
    return json({ error: 'device_key_attestation_receipt_mismatch' }, 422);
  if (error instanceof Error && error.message === 'INSTALL_PROOF_NOT_TRUSTED')
    return json({ error: 'install_proof_not_currently_trusted' }, 409);
  return json({ error: 'device_entitlement_unavailable' }, 503);
}

async function eligibleOrder(orderId: string, ownerUserId: string) {
  const db = database();
  const row = await db.prepare(`SELECT o.id, o.buyer_user_id AS buyerUserId, o.mode, o.status,
      o.package_key AS packageKey, o.manifest_sha256 AS manifestSha256,
      o.amount_minor AS amountMinor, o.currency, o.refunded_minor AS refundedMinor,
      p.state AS providerState, p.profile_digest AS profileDigest,
      i.device_ref AS deviceRef, i.receipt_sha256 AS installReceiptSha256,
      i.issuer_id AS installIssuerId, i.key_id AS installKeyId
    FROM sky_commerce_orders o
    JOIN esim_provider_orders p ON p.sky_order_id = o.id AND p.owner_user_id = o.buyer_user_id
    JOIN esim_provider_profile_bindings b ON b.sky_order_id = o.id AND b.owner_user_id = o.buyer_user_id
      AND b.profile_digest = p.profile_digest
    JOIN esim_device_install_receipts i ON i.sky_order_id = o.id
      AND i.owner_user_id = o.buyer_user_id AND i.profile_digest = b.profile_digest
    WHERE o.id = ? AND o.buyer_user_id = ? AND o.mode = 'live'
      AND o.status = 'paid' AND o.refunded_minor = 0 AND p.state = 'profile_bound'`)
    .bind(orderId, ownerUserId).first<{
      id: string; buyerUserId: string; mode: string; status: string; packageKey: string;
      manifestSha256: string; amountMinor: number; currency: string; refundedMinor: number;
      providerState: string; profileDigest: string; deviceRef: string; installReceiptSha256: string;
      installIssuerId: string; installKeyId: string;
    }>();
  if (!row) return null;
  const config = env as unknown as {
    ESIMGO_PLAN_CATALOG_JSON?: string;
    ESIM_DEVICE_GATEWAY_KEYS?: string;
    ESIM_INSTALL_RECEIPT_KEYS?: string;
    ANDROID_ATTESTATION_VERIFIER_URL?: string;
    ANDROID_ATTESTATION_VERIFIER_TOKEN?: string;
    ANDROID_ATTESTATION_VERIFIER_COMMIT?: string;
    ANDROID_ATTESTATION_VERIFIER?: { fetch: typeof fetch };
  };
  if (!hasTrustedEsimInstallIssuerKey(
    config.ESIM_INSTALL_RECEIPT_KEYS, row.installIssuerId, row.installKeyId,
  )) throw new Error('INSTALL_PROOF_NOT_TRUSTED');
  const pricing = await selectEsimOrderPricing(db, config.ESIMGO_PLAN_CATALOG_JSON, row, ownerUserId);
  const registry = await skyToolPackageStore(db).listRegistry();
  await verifyEsimStarterAgentPack(pricing.plan, registry);
  const packHash = await sha256Hex(JSON.stringify(pricing.plan.starterAgentPack));
  return { db, row, pack: pricing.plan.starterAgentPack, packHash, config };
}

export async function POST(request: Request, context: { params: Promise<{ orderId: string }> }) {
  try {
    const ownerUserId = await requestUser(request);
    const { orderId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json({ error: 'order_not_found' }, 404);
    const body = await readBody(request);
    const eligible = await eligibleOrder(orderId, ownerUserId);
    if (!eligible) return json({ error: 'order_or_install_proof_not_found' }, 404);
    const entitlements = esimDeviceEntitlementStore(eligible.db);
    const alreadyActive = await entitlements.entitlementByOrder(ownerUserId, orderId);
    if (alreadyActive) {
      if (alreadyActive.deviceRef === eligible.row.deviceRef &&
          alreadyActive.installReceiptSha256 === eligible.row.installReceiptSha256 &&
          alreadyActive.starterPackManifestSha256 === eligible.packHash) {
        const currentKey = await trustedEsimDeviceGatewayKeyFingerprint(
          eligible.config.ESIM_DEVICE_GATEWAY_KEYS, {
            authorityId: alreadyActive.authorityId, ownerUserId,
            deviceRef: alreadyActive.deviceRef, keyId: alreadyActive.keyId,
          },
        );
        const attestedKey = await entitlements.attestedGatewayKey({
          authorityId: alreadyActive.authorityId, ownerUserId,
          deviceRef: alreadyActive.deviceRef, keyId: alreadyActive.keyId,
        });
        const verifiedKey = currentKey ?? (attestedKey
          ? { algorithm: attestedKey.algorithm, publicKeySha256: attestedKey.publicKeySha256 }
          : null);
        if (!verifiedKey || verifiedKey.algorithm !== alreadyActive.signatureAlgorithm ||
            verifiedKey.publicKeySha256 !== alreadyActive.devicePublicKeySha256)
          return json({ error: 'device_gateway_key_revoked_or_rotated', state: 'revoked_or_stale' }, 409);
        return json({ state: 'already_active', esimDeviceEntitlementState: 'active',
          starterPackActivationState: 'active_on_authenticated_device' });
      }
      return json({ error: 'device_entitlement_conflict' }, 409);
    }

    if (body.action === 'challenge') {
      if (Object.keys(body).length !== 1) return json({ error: 'invalid_device_entitlement_request' }, 400);
      const keys = parseTrustedEsimDeviceGatewayKeys(eligible.config.ESIM_DEVICE_GATEWAY_KEYS);
      const verifierReady = Boolean(eligible.config.ANDROID_ATTESTATION_VERIFIER_URL &&
        eligible.config.ANDROID_ATTESTATION_VERIFIER_TOKEN &&
        (!eligible.config.ANDROID_ATTESTATION_VERIFIER_COMMIT ||
          eligible.config.ANDROID_ATTESTATION_VERIFIER_COMMIT === ANDROID_KEY_ATTESTATION_VERIFIER_COMMIT));
      const staticGatewayReady = Boolean(keys && hasTrustedEsimDeviceGatewayKey(
        eligible.config.ESIM_DEVICE_GATEWAY_KEYS, ownerUserId, eligible.row.deviceRef,
      ));
      if (!verifierReady && !staticGatewayReady) throw new Error('DEVICE_GATEWAY_CONFIG');
      const now = Date.now();
      if (await entitlements.activeChallengeCount(ownerUserId, orderId, now) >= MAX_OPEN_CHALLENGES)
        return json({ error: 'too_many_open_challenges' }, 429);
      const nonce = new Uint8Array(32);
      crypto.getRandomValues(nonce);
      const challengeNonce = nonceString(nonce);
      const challengeId = crypto.randomUUID();
      const expiresAt = now + CHALLENGE_TTL_MS;
      await entitlements.createChallenge({
        id: challengeId,
        skyOrderId: orderId,
        ownerUserId,
        profileDigest: eligible.row.profileDigest,
        deviceRef: eligible.row.deviceRef,
        installReceiptSha256: eligible.row.installReceiptSha256,
        starterPackId: eligible.pack.id,
        starterPackVersion: eligible.pack.version,
        starterPackManifestSha256: eligible.packHash,
        nonceSha256: await sha256Hex(challengeNonce),
        createdAt: now,
        expiresAt,
        consumedAt: null,
      });
      return json({
        state: 'challenge_issued', challengeId, challengeNonce, expiresAt,
        deviceRef: eligible.row.deviceRef, starterPack: eligible.pack,
        starterPackManifestSha256: eligible.packHash,
        receiptContext: {
          ownerUserId,
          orderId,
          profileDigest: eligible.row.profileDigest,
          deviceRef: eligible.row.deviceRef,
          installReceiptSha256: eligible.row.installReceiptSha256,
          starterPackId: eligible.pack.id,
          starterPackVersion: eligible.pack.version,
          attestedGatewayAuthorityId: ANDROID_KEY_ATTESTATION_AUTHORITY,
          attestedGatewayKeyId: 'sha256-of-uncompressed-p256-public-key',
          attestedApplicationPackage: 'dev.rock.automation',
        },
      });
    }

    const hasAttestationChain = Object.hasOwn(body, 'certificateChainDerBase64Url');
    if (body.action !== 'submit' || Object.keys(body).length !== (hasAttestationChain ? 5 : 4) ||
        typeof body.challengeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.challengeId) ||
        typeof body.challengeNonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.challengeNonce) ||
        !body.receipt || typeof body.receipt !== 'object' || Array.isArray(body.receipt))
      return json({ error: 'invalid_device_entitlement_request' }, 400);

    const challenge = await entitlements.challenge(ownerUserId, orderId, body.challengeId);
    if (!challenge || challenge.profileDigest !== eligible.row.profileDigest ||
        challenge.deviceRef !== eligible.row.deviceRef ||
        challenge.installReceiptSha256 !== eligible.row.installReceiptSha256 ||
        challenge.starterPackId !== eligible.pack.id || challenge.starterPackVersion !== eligible.pack.version ||
        challenge.starterPackManifestSha256 !== eligible.packHash || challenge.consumedAt !== null ||
        challenge.expiresAt <= Date.now() || challenge.nonceSha256 !== await sha256Hex(body.challengeNonce))
      return json({ error: 'device_entitlement_challenge_invalid_or_expired' }, 409);

    if (hasAttestationChain) {
      const state = await activateAttestedEsimDevice({
        verifier: {
          endpoint: eligible.config.ANDROID_ATTESTATION_VERIFIER_URL,
          token: eligible.config.ANDROID_ATTESTATION_VERIFIER_TOKEN,
          expectedCommit: eligible.config.ANDROID_ATTESTATION_VERIFIER_COMMIT,
          fetcher: eligible.config.ANDROID_ATTESTATION_VERIFIER
            ? (input, init) => eligible.config.ANDROID_ATTESTATION_VERIFIER!.fetch(new Request(input, init))
            : fetch,
        },
        certificateChainDerBase64Url: body.certificateChainDerBase64Url as string[],
        receiptValue: body.receipt,
        challenge,
        challengeNonce: body.challengeNonce,
        ownerUserId,
        orderId,
        profileDigest: eligible.row.profileDigest,
        deviceRef: eligible.row.deviceRef,
        installReceiptSha256: eligible.row.installReceiptSha256,
        starterPackId: eligible.pack.id,
        starterPackVersion: eligible.pack.version,
        starterPackManifestSha256: eligible.packHash,
        store: entitlements,
      });
      if (state === 'challenge_unavailable') return json({ error: 'device_entitlement_challenge_unavailable' }, 409);
      if (state === 'entitlement_conflict') return json({ error: 'device_entitlement_conflict' }, 409);
      if (state === 'gateway_key_conflict') return json({ error: 'device_gateway_key_conflict' }, 409);
      return json({ state, esimDeviceEntitlementState: 'active',
        starterPackActivationState: 'active_on_authenticated_device' });
    }

    const staticKeyResolver = trustedEsimDeviceGatewayKeyResolver(eligible.config.ESIM_DEVICE_GATEWAY_KEYS);
    const resolveGatewayKey = async (identity: {
      authorityId: string; ownerUserId: string; deviceRef: string; keyId: string;
    }) => {
      const enrolled = await entitlements.attestedGatewayKey(identity);
      if (enrolled) return { algorithm: enrolled.algorithm, publicKey: enrolled.publicKey };
      return staticKeyResolver(identity);
    };

    const receipt = await verifyEsimDeviceEntitlementReceipt(body.receipt, {
      ownerUserId,
      orderId,
      profileDigest: eligible.row.profileDigest,
      challengeId: challenge.id,
      challengeNonce: body.challengeNonce,
      deviceRef: eligible.row.deviceRef,
      installReceiptSha256: eligible.row.installReceiptSha256,
      starterPackId: eligible.pack.id,
      starterPackVersion: eligible.pack.version,
      starterPackManifestSha256: eligible.packHash,
    }, resolveGatewayKey);
    if (!receipt) return json({ error: 'device_entitlement_receipt_invalid' }, 422);
    const staticDeviceKey = await trustedEsimDeviceGatewayKeyFingerprint(
      eligible.config.ESIM_DEVICE_GATEWAY_KEYS, {
        authorityId: receipt.authorityId, ownerUserId, deviceRef: receipt.deviceRef, keyId: receipt.keyId,
      },
    );
    const enrolledDeviceKey = await entitlements.attestedGatewayKey({
      authorityId: receipt.authorityId, ownerUserId, deviceRef: receipt.deviceRef, keyId: receipt.keyId,
    });
    const deviceKey = staticDeviceKey ?? (enrolledDeviceKey
        ? { algorithm: enrolledDeviceKey.algorithm, publicKeySha256: enrolledDeviceKey.publicKeySha256 }
        : null);
    if (!deviceKey || deviceKey.algorithm !== receipt.signatureAlgorithm)
      return json({ error: 'device_entitlement_key_unavailable' }, 409);

    const state = await entitlements.saveEntitlement({
      challengeId: challenge.id,
      skyOrderId: orderId,
      ownerUserId,
      profileDigest: receipt.profileDigest,
      deviceRef: receipt.deviceRef,
      installReceiptSha256: receipt.installReceiptSha256,
      authorityId: receipt.authorityId,
      keyId: receipt.keyId,
      signatureAlgorithm: deviceKey.algorithm,
      devicePublicKeySha256: deviceKey.publicKeySha256,
      starterPackId: receipt.starterPackId,
      starterPackVersion: receipt.starterPackVersion,
      starterPackManifestSha256: receipt.starterPackManifestSha256,
      receiptSha256: await sha256Hex(esimDeviceEntitlementSigningBytes(receipt)),
      observedAt: receipt.observedAt,
      activatedAt: Date.now(),
      nonceSha256: challenge.nonceSha256,
    }, Date.now());
    if (state === 'challenge_unavailable') return json({ error: 'device_entitlement_challenge_unavailable' }, 409);
    if (state === 'entitlement_conflict') return json({ error: 'device_entitlement_conflict' }, 409);
    if (state === 'gateway_key_conflict') return json({ error: 'device_gateway_key_conflict' }, 409);
    return json({ state, esimDeviceEntitlementState: 'active',
      starterPackActivationState: 'active_on_authenticated_device' });
  } catch (error) {
    return errorResponse(error);
  }
}
