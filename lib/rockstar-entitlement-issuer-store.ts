import {
  issueRockstarEntitlementClaim,
  type RockstarEntitlementClaimIssue,
} from './rockstar-entitlement-issuer.ts';
import {
  sha256Hex,
  type RockstarEntitlementClaim,
} from './rockstar-entitlement-claim.ts';

type D1Store = Pick<D1Database, 'prepare'>;
type IssuedPackage = { claim: RockstarEntitlementClaim; claimCode: string };
export type RockstarEntitlementCodeKeyring = {
  currentKeyId: string;
  keys: Record<string, string>;
};
type DeliveryRow = {
  issuerId: string;
  idempotencyKeySha256: string;
  requestSha256: string;
  purchaseReferenceSha256: string;
  claimId: string;
  claimJson: string;
  claimJsonSha256: string;
  codeEncryptionKeyId: string;
  claimCodeCiphertext: string | null;
  claimCodeNonce: string | null;
  state: 'prepared' | 'delivered';
  deliveredAt: number | null;
};

export class RockstarEntitlementIssuerStoreError extends Error {
  readonly code: 'KEY_NOT_CONFIGURED' | 'INVALID_INPUT' | 'IDEMPOTENCY_CONFLICT' |
    'PACKAGE_MISMATCH' | 'DELIVERY_NOT_PENDING' | 'PERSISTENCE_UNCONFIRMED';

  constructor(code: RockstarEntitlementIssuerStoreError['code']) {
    super(code);
    this.name = 'RockstarEntitlementIssuerStoreError';
    this.code = code;
  }
}

function bufferSource(value: Uint8Array): ArrayBuffer {
  const result = new ArrayBuffer(value.byteLength);
  new Uint8Array(result).set(value);
  return result;
}

function b64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function fromB64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4);
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

async function encryptionKey(keyring: RockstarEntitlementCodeKeyring, keyId = keyring?.currentKeyId): Promise<CryptoKey> {
  if (!keyId || !/^[A-Za-z0-9._-]{1,64}$/.test(keyId)) throw new RockstarEntitlementIssuerStoreError('KEY_NOT_CONFIGURED');
  const hex = keyring?.keys?.[keyId];
  if (!hex || !/^[a-f0-9]{64}$/i.test(hex)) throw new RockstarEntitlementIssuerStoreError('KEY_NOT_CONFIGURED');
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16));
  return crypto.subtle.importKey('raw', bufferSource(bytes), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function idempotencyDigest(issuerId: string, key: string): Promise<string> {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(key)) throw new RockstarEntitlementIssuerStoreError('INVALID_INPUT');
  return sha256Hex(`rockstar-entitlement-delivery-idempotency-v1\n${issuerId}\n${key}`);
}

function canonicalIssue(input: RockstarEntitlementClaimIssue) {
  return JSON.stringify({
    issuerId: input.issuerId,
    issuerKeyId: input.issuerKeyId,
    offerId: input.offerId,
    purchaseReferenceSha256: input.purchaseReferenceSha256,
    formFactor: input.formFactor,
    scopes: [...input.scopes].sort(),
    expiresAt: input.expiresAt ?? null,
  });
}

async function aad(issuerId: string, idempotencyHash: string, requestHash: string, claimHash: string, keyId: string) {
  return new TextEncoder().encode(`rockstar-entitlement-delivery-v1\n${issuerId}\n${idempotencyHash}\n${requestHash}\n${claimHash}\n${keyId}`);
}

async function encryptCode(
  claimCode: string,
  key: CryptoKey,
  issuerId: string,
  idempotencyHash: string,
  requestHash: string,
  claimHash: string,
  keyId: string,
) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: bufferSource(nonce),
    additionalData: bufferSource(await aad(issuerId, idempotencyHash, requestHash, claimHash, keyId)) },
  key, bufferSource(new TextEncoder().encode(claimCode)));
  return { ciphertext: b64url(new Uint8Array(ciphertext)), nonce: b64url(nonce) };
}

async function readRow(db: D1Store, issuerId: string, idempotencyHash: string) {
  return db.prepare(`SELECT issuer_id AS issuerId, idempotency_key_sha256 AS idempotencyKeySha256,
      request_sha256 AS requestSha256, purchase_reference_sha256 AS purchaseReferenceSha256,
      claim_id AS claimId, claim_json AS claimJson, claim_json_sha256 AS claimJsonSha256,
      code_encryption_key_id AS codeEncryptionKeyId,
      claim_code_ciphertext AS claimCodeCiphertext, claim_code_nonce AS claimCodeNonce,
      state, delivered_at AS deliveredAt
    FROM rockstar_entitlement_issuer_deliveries WHERE issuer_id = ? AND idempotency_key_sha256 = ?`)
    .bind(issuerId, idempotencyHash).first<DeliveryRow>();
}

async function recoverPackage(
  row: DeliveryRow,
  keyring: RockstarEntitlementCodeKeyring,
): Promise<{ claim: RockstarEntitlementClaim; claimCode: string } | null> {
  let claim: RockstarEntitlementClaim;
  try {
    if (await sha256Hex(row.claimJson) !== row.claimJsonSha256) throw new Error('HASH_MISMATCH');
    claim = JSON.parse(row.claimJson) as RockstarEntitlementClaim;
  } catch {
    throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  }
  if (row.state === 'delivered') {
    if (row.claimCodeCiphertext !== null || row.claimCodeNonce !== null || row.deliveredAt === null)
      throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
    return null;
  }
  if (!row.claimCodeCiphertext || !row.claimCodeNonce || row.deliveredAt !== null)
    throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  let claimCode: string;
  try {
    const key = await encryptionKey(keyring, row.codeEncryptionKeyId);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM',
      iv: bufferSource(fromB64url(row.claimCodeNonce)),
      additionalData: bufferSource(await aad(row.issuerId, row.idempotencyKeySha256,
        row.requestSha256, row.claimJsonSha256, row.codeEncryptionKeyId)) }, key, bufferSource(fromB64url(row.claimCodeCiphertext)));
    claimCode = new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  }
  if (claim.claimId !== row.claimId || claim.issuerId !== row.issuerId ||
      claim.purchaseReferenceSha256 !== row.purchaseReferenceSha256 ||
      await sha256Hex(claimCode) !== claim.claimCodeSha256) {
    throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  }
  return { claim, claimCode };
}

async function persistPackage(
  db: D1Store,
  packageValue: IssuedPackage,
  keyring: RockstarEntitlementCodeKeyring,
  idempotencyKey: string,
  requestSha256: string,
  now: number,
) {
  const { claim, claimCode } = packageValue;
  if (!claim || !claimCode || await sha256Hex(claimCode) !== claim.claimCodeSha256)
    throw new RockstarEntitlementIssuerStoreError('PACKAGE_MISMATCH');
  const idempotencyHash = await idempotencyDigest(claim.issuerId, idempotencyKey);
  const claimJson = JSON.stringify(claim);
  const claimHash = await sha256Hex(claimJson);
  const keyId = keyring?.currentKeyId;
  const key = await encryptionKey(keyring, keyId);
  const encrypted = await encryptCode(claimCode, key, claim.issuerId, idempotencyHash, requestSha256, claimHash, keyId);
  const inserted = await db.prepare(`INSERT OR IGNORE INTO rockstar_entitlement_issuer_deliveries
    (issuer_id,idempotency_key_sha256,request_sha256,purchase_reference_sha256,claim_id,claim_json,
      claim_json_sha256,code_encryption_key_id,claim_code_ciphertext,claim_code_nonce,state,created_at,updated_at,delivered_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,'prepared',?,?,NULL)`)
    .bind(claim.issuerId, idempotencyHash, requestSha256, claim.purchaseReferenceSha256,
      claim.claimId, claimJson, claimHash, keyId, encrypted.ciphertext, encrypted.nonce, now, now).run();
  const row = await readRow(db, claim.issuerId, idempotencyHash);
  if (!row) throw new RockstarEntitlementIssuerStoreError('PERSISTENCE_UNCONFIRMED');
  if (row.requestSha256 !== requestSha256 &&
      (row.claimJsonSha256 !== claimHash || row.claimJson !== claimJson))
    throw new RockstarEntitlementIssuerStoreError('IDEMPOTENCY_CONFLICT');
  const recovered = await recoverPackage(row, keyring);
  return { row, recovered, idempotencyKeySha256: idempotencyHash, inserted: (inserted.meta?.changes ?? 0) > 0 };
}

/** Issue or recover the exact signed package for one seller idempotency key. */
export async function issueRockstarEntitlementDeliveryOnce(
  db: D1Store,
  input: RockstarEntitlementClaimIssue,
  privateKey: CryptoKey,
  keyring: RockstarEntitlementCodeKeyring,
  idempotencyKey: string,
  now = Date.now(),
) {
  await encryptionKey(keyring);
  const idempotencyHash = await idempotencyDigest(input.issuerId, idempotencyKey);
  const requestSha256 = await sha256Hex(`rockstar-entitlement-issue-request-v1\n${canonicalIssue(input)}`);
  const existing = await readRow(db, input.issuerId, idempotencyHash);
  if (existing) {
    if (existing.requestSha256 !== requestSha256) throw new RockstarEntitlementIssuerStoreError('IDEMPOTENCY_CONFLICT');
    return { state: existing.state, packageValue: await recoverPackage(existing, keyring), replayed: true } as const;
  }
  const packageValue = await issueRockstarEntitlementClaim({ ...input, scopes: [...input.scopes].sort() }, privateKey, now);
  const stored = await persistPackage(db, packageValue, keyring, idempotencyKey, requestSha256, now);
  if (stored.row.requestSha256 !== requestSha256) throw new RockstarEntitlementIssuerStoreError('IDEMPOTENCY_CONFLICT');
  return { state: stored.row.state, packageValue: stored.recovered, replayed: stored.row.claimId !== packageValue.claim.claimId } as const;
}

/** Persist an already-signed replacement package and recover that exact package on retry. */
export async function retainRockstarEntitlementDeliveryOnce(
  db: D1Store,
  packageValue: IssuedPackage,
  keyring: RockstarEntitlementCodeKeyring,
  idempotencyKey: string,
  now = Date.now(),
) {
  await encryptionKey(keyring);
  const requestSha256 = await sha256Hex(`rockstar-entitlement-package-delivery-v1\n${JSON.stringify(packageValue.claim)}\n${packageValue.claim.claimCodeSha256}`);
  const stored = await persistPackage(db, packageValue, keyring, idempotencyKey, requestSha256, now);
  return { state: stored.row.state, packageValue: stored.recovered,
    replayed: !stored.inserted } as const;
}

/** Read a seller-owned pending package for recovery; delivered rows never reveal the code again. */
export async function getRockstarEntitlementDelivery(
  db: D1Store,
  issuerId: string,
  keyring: RockstarEntitlementCodeKeyring,
  idempotencyKey: string,
) {
  await encryptionKey(keyring);
  const idempotencyHash = await idempotencyDigest(issuerId, idempotencyKey);
  const row = await readRow(db, issuerId, idempotencyHash);
  if (!row) return null;
  return { state: row.state, claimId: row.claimId,
    packageValue: await recoverPackage(row, keyring), replayed: true } as const;
}

/** Acknowledge delivery only after the idempotent channel callback confirms receipt. */
export async function acknowledgeRockstarEntitlementDelivery(
  db: D1Store,
  issuerId: string,
  idempotencyKey: string,
  claimId: string,
  now = Date.now(),
): Promise<'acknowledged' | 'already_acknowledged'> {
  const idempotencyHash = await idempotencyDigest(issuerId, idempotencyKey);
  const update = await db.prepare(`UPDATE rockstar_entitlement_issuer_deliveries
    SET state='delivered',claim_code_ciphertext=NULL,claim_code_nonce=NULL,delivered_at=?,updated_at=?
    WHERE issuer_id=? AND idempotency_key_sha256=? AND claim_id=? AND state='prepared'
      AND claim_code_ciphertext IS NOT NULL AND claim_code_nonce IS NOT NULL AND delivered_at IS NULL`)
    .bind(now, now, issuerId, idempotencyHash, claimId).run();
  if ((update.meta?.changes ?? 0) > 0) return 'acknowledged';
  const row = await readRow(db, issuerId, idempotencyHash);
  if (row?.claimId === claimId && row.state === 'delivered' && row.claimCodeCiphertext === null &&
      row.claimCodeNonce === null && row.deliveredAt !== null) return 'already_acknowledged';
  throw new RockstarEntitlementIssuerStoreError('DELIVERY_NOT_PENDING');
}

/**
 * Run a seller delivery adapter against the retained package. On timeout the
 * row remains prepared; retries decrypt and resend the exact same package.
 */
export async function deliverRockstarEntitlementOnce(
  db: D1Store,
  packageValue: IssuedPackage,
  keyring: RockstarEntitlementCodeKeyring,
  idempotencyKey: string,
  deliver: (value: IssuedPackage, idempotencyKey: string) => Promise<void>,
  now = Date.now(),
) {
  const retained = await retainRockstarEntitlementDeliveryOnce(db, packageValue, keyring, idempotencyKey, now);
  if (retained.state === 'delivered' || !retained.packageValue)
    return { state: 'delivered' as const, replayed: true };
  await deliver(retained.packageValue, idempotencyKey);
  const acknowledgement = await acknowledgeRockstarEntitlementDelivery(db, packageValue.claim.issuerId,
    idempotencyKey, packageValue.claim.claimId, now);
  return { state: 'delivered' as const, replayed: retained.replayed, acknowledgement };
}
