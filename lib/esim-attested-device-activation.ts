import {
  ANDROID_KEY_ATTESTATION_AUTHORITY,
  verifyAndroidKeyAttestation,
} from './android-key-attestation-client.ts';
import {
  esimDeviceEntitlementSigningBytes,
  verifyEsimDeviceEntitlementReceipt,
} from './esim-device-entitlement.ts';
import {
  esimDeviceEntitlementStore,
  type EsimDeviceGatewayChallenge,
} from './esim-device-entitlement-store.ts';

const APPLICATION_PACKAGE = 'dev.rock.automation';

type EntitlementStore = ReturnType<typeof esimDeviceEntitlementStore>;

type ActivationInput = {
  verifier: {
    endpoint?: string;
    token?: string;
    expectedCommit?: string;
    fetcher?: typeof fetch;
  };
  certificateChainDerBase64Url: string[];
  receiptValue: unknown;
  challenge: EsimDeviceGatewayChallenge;
  challengeNonce: string;
  ownerUserId: string;
  orderId: string;
  profileDigest: string;
  deviceRef: string;
  installReceiptSha256: string;
  starterPackId: string;
  starterPackVersion: string;
  starterPackManifestSha256: string;
  store: EntitlementStore;
  now?: () => number;
};

async function sha256Hex(value: Uint8Array) {
  const copy = new Uint8Array(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer as ArrayBuffer));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Verify a fresh Android key attestation and receipt, then atomically enroll key + entitlement. */
export async function activateAttestedEsimDevice(input: ActivationInput) {
  const currentTime = input.now ?? Date.now;
  const attestedKey = await verifyAndroidKeyAttestation({
    endpoint: input.verifier.endpoint,
    token: input.verifier.token,
    expectedCommit: input.verifier.expectedCommit,
  }, {
    challengeId: input.challenge.id,
    challengeNonce: input.challengeNonce,
    packageName: APPLICATION_PACKAGE,
    certificateChainDerBase64Url: input.certificateChainDerBase64Url,
  }, input.verifier.fetcher ?? fetch);

  if (attestedKey.authorityId !== ANDROID_KEY_ATTESTATION_AUTHORITY ||
      attestedKey.applicationPackage !== APPLICATION_PACKAGE ||
      attestedKey.verifiedBootState !== 'VERIFIED' || !attestedKey.deviceLocked)
    throw new Error('ATTESTATION_REJECTED');

  const enrolledKey = await input.store.gatewayKeyById(attestedKey.keyId);
  if (enrolledKey && (enrolledKey.authorityId !== attestedKey.authorityId ||
      enrolledKey.ownerUserId !== input.ownerUserId || enrolledKey.deviceRef !== input.deviceRef ||
      enrolledKey.status !== 'active' || enrolledKey.publicKeySha256 !== attestedKey.publicKeySha256))
    throw new Error('DEVICE_GATEWAY_KEY_CONFLICT');

  const receipt = await verifyEsimDeviceEntitlementReceipt(input.receiptValue, {
    ownerUserId: input.ownerUserId,
    orderId: input.orderId,
    profileDigest: input.profileDigest,
    challengeId: input.challenge.id,
    challengeNonce: input.challengeNonce,
    deviceRef: input.deviceRef,
    installReceiptSha256: input.installReceiptSha256,
    starterPackId: input.starterPackId,
    starterPackVersion: input.starterPackVersion,
    starterPackManifestSha256: input.starterPackManifestSha256,
  }, async (identity) => {
    if (identity.authorityId !== attestedKey.authorityId ||
        identity.ownerUserId !== input.ownerUserId || identity.deviceRef !== input.deviceRef ||
        identity.keyId !== attestedKey.keyId) return null;
    return { algorithm: 'ES256', publicKey: attestedKey.publicKey };
  }, currentTime());
  if (!receipt) throw new Error('DEVICE_ENTITLEMENT_RECEIPT_INVALID');
  if (receipt.authorityId !== attestedKey.authorityId || receipt.keyId !== attestedKey.keyId ||
      receipt.signatureAlgorithm !== 'ES256')
    throw new Error('DEVICE_KEY_ATTESTATION_RECEIPT_MISMATCH');

  const receiptSha256 = await sha256Hex(esimDeviceEntitlementSigningBytes(receipt));
  return input.store.saveEntitlement({
    challengeId: input.challenge.id,
    skyOrderId: input.orderId,
    ownerUserId: input.ownerUserId,
    profileDigest: receipt.profileDigest,
    deviceRef: receipt.deviceRef,
    installReceiptSha256: receipt.installReceiptSha256,
    authorityId: receipt.authorityId,
    keyId: receipt.keyId,
    signatureAlgorithm: 'ES256',
    devicePublicKeySha256: attestedKey.publicKeySha256,
    starterPackId: receipt.starterPackId,
    starterPackVersion: receipt.starterPackVersion,
    starterPackManifestSha256: receipt.starterPackManifestSha256,
    receiptSha256,
    observedAt: receipt.observedAt,
    activatedAt: currentTime(),
    nonceSha256: input.challenge.nonceSha256,
  }, currentTime(), {
    authorityId: attestedKey.authorityId,
    ownerUserId: input.ownerUserId,
    deviceRef: input.deviceRef,
    keyId: attestedKey.keyId,
    algorithm: 'ES256',
    publicKeyHex: attestedKey.publicKeyHex,
    publicKeySha256: attestedKey.publicKeySha256,
    applicationPackage: attestedKey.applicationPackage,
    minimumApplicationVersion: attestedKey.minimumApplicationVersion,
    signingCertificateSha256: attestedKey.signingCertificateSha256,
    securityLevel: attestedKey.securityLevel,
    verifiedBootState: attestedKey.verifiedBootState,
    attestedAt: attestedKey.verifiedAt,
  });
}
