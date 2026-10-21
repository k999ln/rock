import type { AndroidKeyAttestationResult } from './android-key-attestation-client.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
const ANDROID_AUTHORITY = 'android-key-attestation-google';
const ANDROID_PACKAGE = 'dev.rock.automation';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type A2ABrokerEnrollmentChallenge = {
  id: string;
  ownerUserId: string;
  deviceRef: string;
  nonceSha256: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

function safeId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(value);
}

function validAttestation(value: AndroidKeyAttestationResult) {
  return value.authorityId === ANDROID_AUTHORITY && value.keyId === value.publicKeySha256 &&
    /^[a-f0-9]{64}$/.test(value.keyId) && value.publicKey.length === 65 && value.publicKey[0] === 4 &&
    value.publicKeyHex === Array.from(value.publicKey, (byte) => byte.toString(16).padStart(2, '0')).join('') &&
    value.applicationPackage === ANDROID_PACKAGE && value.deviceLocked === true &&
    value.verifiedBootState === 'VERIFIED' &&
    (value.securityLevel === 'TRUSTED_ENVIRONMENT' || value.securityLevel === 'STRONG_BOX') &&
    /^[0-9a-f]{64}$/.test(value.signingCertificateSha256) &&
    /^(0|[1-9][0-9]{0,8})$/.test(value.minimumApplicationVersion) &&
    Number.isSafeInteger(value.verifiedAt);
}

export function a2aBrokerDeviceStore(db: Database) {
  return {
    async createChallenge(input: A2ABrokerEnrollmentChallenge, now = Date.now()) {
      if (!UUID.test(input.id) || !UUID.test(input.deviceRef) || !safeId(input.ownerUserId) ||
          !/^[a-f0-9]{64}$/.test(input.nonceSha256) || input.createdAt !== now ||
          input.expiresAt <= now || input.expiresAt > now + 5 * 60_000 || input.consumedAt !== null)
        throw new Error('A2A_BROKER_CHALLENGE_INVALID');
      const counts = await db.prepare(`SELECT
          SUM(CASE WHEN consumed_at IS NULL AND expires_at > ? THEN 1 ELSE 0 END) AS activeCount,
          SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS recentCount
        FROM rockstar_a2a_broker_enrollment_challenges
        WHERE owner_user_id = ? AND device_ref = ?`)
        .bind(now, now - 10 * 60_000, input.ownerUserId, input.deviceRef)
        .first<{ activeCount: number; recentCount: number }>();
      if ((counts?.activeCount ?? 0) >= 3 || (counts?.recentCount ?? 0) >= 6)
        throw new Error('A2A_BROKER_CHALLENGE_RATE_LIMIT');
      await db.prepare(`INSERT INTO rockstar_a2a_broker_enrollment_challenges
        (id, owner_user_id, device_ref, nonce_sha256, created_at, expires_at, consumed_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)`)
        .bind(input.id, input.ownerUserId, input.deviceRef, input.nonceSha256, input.createdAt, input.expiresAt)
        .run();
      return input;
    },

    async challenge(ownerUserId: string, deviceRef: string, id: string) {
      return db.prepare(`SELECT id, owner_user_id AS ownerUserId, device_ref AS deviceRef,
          nonce_sha256 AS nonceSha256, created_at AS createdAt, expires_at AS expiresAt,
          consumed_at AS consumedAt
        FROM rockstar_a2a_broker_enrollment_challenges
        WHERE id = ? AND owner_user_id = ? AND device_ref = ?`)
        .bind(id, ownerUserId, deviceRef).first<A2ABrokerEnrollmentChallenge>();
    },

    async challengeById(ownerUserId: string, id: string) {
      return db.prepare(`SELECT id, owner_user_id AS ownerUserId, device_ref AS deviceRef,
          nonce_sha256 AS nonceSha256, created_at AS createdAt, expires_at AS expiresAt,
          consumed_at AS consumedAt
        FROM rockstar_a2a_broker_enrollment_challenges WHERE id = ? AND owner_user_id = ?`)
        .bind(id, ownerUserId).first<A2ABrokerEnrollmentChallenge>();
    },

    async enroll(input: {
      challenge: A2ABrokerEnrollmentChallenge;
      challengeNonceSha256: string;
      attestedKey: AndroidKeyAttestationResult;
      now?: number;
    }) {
      const now = input.now ?? Date.now();
      const { challenge, attestedKey } = input;
      if (!validAttestation(attestedKey) || challenge.consumedAt !== null ||
          challenge.expiresAt <= now || challenge.ownerUserId.length > 128 ||
          challenge.nonceSha256 !== input.challengeNonceSha256)
        return 'challenge_unavailable' as const;

      const prior = await db.prepare(`SELECT owner_user_id AS ownerUserId, device_ref AS deviceRef,
          public_key_sha256 AS publicKeySha256, status
        FROM rockstar_a2a_broker_devices WHERE authority_id = ? AND key_id = ?`)
        .bind(attestedKey.authorityId, attestedKey.keyId)
        .first<{ ownerUserId: string; deviceRef: string; publicKeySha256: string; status: string }>();
      if (prior) {
        if (prior.ownerUserId !== challenge.ownerUserId || prior.deviceRef !== challenge.deviceRef ||
            prior.publicKeySha256 !== attestedKey.publicKeySha256 || prior.status !== 'active')
          return 'key_conflict' as const;
        return 'already_registered' as const;
      }

      const inserted = db.prepare(`INSERT OR IGNORE INTO rockstar_a2a_broker_devices
        (authority_id, owner_user_id, device_ref, key_id, algorithm, public_key_hex,
         public_key_sha256, application_package, minimum_application_version,
         signing_certificate_sha256, security_level, verified_boot_state, attested_at,
         registered_at, status, revoked_at)
        SELECT ?, ?, ?, ?, 'ES256', ?, ?, ?, ?, ?, ?, 'VERIFIED', ?, ?, 'active', NULL
        WHERE EXISTS (SELECT 1 FROM rockstar_a2a_broker_enrollment_challenges c
          WHERE c.id = ? AND c.owner_user_id = ? AND c.device_ref = ? AND c.nonce_sha256 = ?
            AND c.consumed_at IS NULL AND c.expires_at > ?)
          AND NOT EXISTS (SELECT 1 FROM rockstar_a2a_broker_devices d
            WHERE d.authority_id = ? AND d.key_id = ?)`)
        .bind(attestedKey.authorityId, challenge.ownerUserId, challenge.deviceRef,
          attestedKey.keyId, attestedKey.publicKeyHex, attestedKey.publicKeySha256,
          attestedKey.applicationPackage, attestedKey.minimumApplicationVersion,
          attestedKey.signingCertificateSha256, attestedKey.securityLevel,
          attestedKey.verifiedAt, now, challenge.id, challenge.ownerUserId,
          challenge.deviceRef, input.challengeNonceSha256, now,
          attestedKey.authorityId, attestedKey.keyId);
      const consume = db.prepare(`UPDATE rockstar_a2a_broker_enrollment_challenges SET consumed_at = ?
        WHERE id = ? AND owner_user_id = ? AND device_ref = ? AND nonce_sha256 = ?
          AND consumed_at IS NULL AND expires_at > ?
          AND EXISTS (SELECT 1 FROM rockstar_a2a_broker_devices d
            WHERE d.authority_id = ? AND d.owner_user_id = ? AND d.device_ref = ?
              AND d.key_id = ? AND d.public_key_sha256 = ? AND d.status = 'active')`)
        .bind(now, challenge.id, challenge.ownerUserId, challenge.deviceRef,
          input.challengeNonceSha256, now, attestedKey.authorityId, challenge.ownerUserId,
          challenge.deviceRef, attestedKey.keyId, attestedKey.publicKeySha256);
      const results = await db.batch([inserted, consume]);
      const saved = await db.prepare(`SELECT status FROM rockstar_a2a_broker_devices
        WHERE authority_id = ? AND owner_user_id = ? AND device_ref = ? AND key_id = ?
          AND public_key_sha256 = ?`)
        .bind(attestedKey.authorityId, challenge.ownerUserId, challenge.deviceRef,
          attestedKey.keyId, attestedKey.publicKeySha256).first<{ status: string }>();
      if (!saved || saved.status !== 'active' || results[1]?.meta.changes !== 1)
        return 'challenge_unavailable' as const;
      return results[0]?.meta.changes === 1 ? 'registered' as const : 'already_registered' as const;
    },

    async lookup(identity: { authorityId: string; ownerUserId: string; deviceRef: string; keyId: string }) {
      const row = await db.prepare(`SELECT algorithm, public_key_hex AS publicKeyHex,
          public_key_sha256 AS publicKeySha256, application_package AS applicationPackage,
          minimum_application_version AS minimumApplicationVersion,
          signing_certificate_sha256 AS signingCertificateSha256,
          security_level AS securityLevel, verified_boot_state AS verifiedBootState,
          status, revoked_at AS revokedAt
        FROM rockstar_a2a_broker_devices
        WHERE authority_id = ? AND owner_user_id = ? AND device_ref = ? AND key_id = ?`)
        .bind(identity.authorityId, identity.ownerUserId, identity.deviceRef, identity.keyId)
        .first<{ algorithm: string; publicKeyHex: string; publicKeySha256: string;
          applicationPackage: string; minimumApplicationVersion: string;
          signingCertificateSha256: string; securityLevel: string;
          verifiedBootState: string; status: string; revokedAt: number | null }>();
      if (!row) return null;
      return { ...row, publicKey: row.publicKeyHex };
    },

    async list(ownerUserId: string) {
      const rows = await db.prepare(`SELECT owner_user_id AS ownerUserId, device_ref AS deviceRef,
          key_id AS keyId, algorithm, application_package AS applicationPackage,
          minimum_application_version AS minimumApplicationVersion,
          security_level AS securityLevel, verified_boot_state AS verifiedBootState,
          registered_at AS registeredAt, attested_at AS attestedAt, status, revoked_at AS revokedAt
        FROM rockstar_a2a_broker_devices WHERE owner_user_id = ?
        ORDER BY registered_at DESC LIMIT 100`)
        .bind(ownerUserId).all();
      return rows.results;
    },

    async revoke(ownerUserId: string, deviceRef: string, keyId: string, now = Date.now()) {
      const result = await db.prepare(`UPDATE rockstar_a2a_broker_devices SET status = 'revoked', revoked_at = ?
        WHERE owner_user_id = ? AND device_ref = ? AND key_id = ? AND status = 'active'`)
        .bind(now, ownerUserId, deviceRef, keyId).run();
      return Number(result.meta.changes ?? 0) === 1;
    },
  };
}
