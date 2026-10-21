type Database = Pick<D1Database, 'prepare' | 'batch'>;

export type EsimDeviceGatewayChallenge = {
  id: string;
  skyOrderId: string;
  ownerUserId: string;
  profileDigest: string;
  deviceRef: string;
  installReceiptSha256: string;
  starterPackId: string;
  starterPackVersion: string;
  starterPackManifestSha256: string;
  nonceSha256: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export type EsimDeviceEntitlement = Omit<EsimDeviceGatewayChallenge,
  'id' | 'nonceSha256' | 'createdAt' | 'expiresAt' | 'consumedAt'> & {
  challengeId: string;
  authorityId: string;
  keyId: string;
  signatureAlgorithm: 'Ed25519' | 'ES256' | null;
  devicePublicKeySha256: string | null;
  receiptSha256: string;
  observedAt: number;
  activatedAt: number;
};

export type AttestedEsimDeviceGatewayKey = {
  authorityId: string;
  ownerUserId: string;
  deviceRef: string;
  keyId: string;
  algorithm: 'ES256';
  publicKeyHex: string;
  publicKeySha256: string;
  applicationPackage: string;
  minimumApplicationVersion: string;
  signingCertificateSha256: string;
  securityLevel: 'TRUSTED_ENVIRONMENT' | 'STRONG_BOX';
  verifiedBootState: 'VERIFIED';
  attestedAt: number;
};

export function esimDeviceEntitlementStore(db: Database) {
  return {
    async activeChallengeCount(ownerUserId: string, skyOrderId: string, now: number) {
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM esim_device_gateway_challenges
        WHERE owner_user_id = ? AND sky_order_id = ? AND consumed_at IS NULL AND expires_at > ?`)
        .bind(ownerUserId, skyOrderId, now).first<{ count: number }>();
      return row?.count ?? 0;
    },

    async createChallenge(challenge: EsimDeviceGatewayChallenge) {
      await db.prepare(`INSERT INTO esim_device_gateway_challenges
        (id,sky_order_id,owner_user_id,profile_digest,device_ref,install_receipt_sha256,
         starter_pack_id,starter_pack_version,starter_pack_manifest_sha256,nonce_sha256,
         created_at,expires_at,consumed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?, ?,NULL)`)
        .bind(challenge.id, challenge.skyOrderId, challenge.ownerUserId, challenge.profileDigest,
          challenge.deviceRef, challenge.installReceiptSha256, challenge.starterPackId,
          challenge.starterPackVersion, challenge.starterPackManifestSha256,
          challenge.nonceSha256, challenge.createdAt, challenge.expiresAt).run();
    },

    async challenge(ownerUserId: string, skyOrderId: string, id: string) {
      return db.prepare(`SELECT id, sky_order_id AS skyOrderId, owner_user_id AS ownerUserId,
          profile_digest AS profileDigest, device_ref AS deviceRef,
          install_receipt_sha256 AS installReceiptSha256,
          starter_pack_id AS starterPackId, starter_pack_version AS starterPackVersion,
          starter_pack_manifest_sha256 AS starterPackManifestSha256,
          nonce_sha256 AS nonceSha256, created_at AS createdAt, expires_at AS expiresAt,
          consumed_at AS consumedAt
        FROM esim_device_gateway_challenges
        WHERE id = ? AND owner_user_id = ? AND sky_order_id = ?`)
        .bind(id, ownerUserId, skyOrderId).first<EsimDeviceGatewayChallenge>();
    },

    async entitlementByOrder(ownerUserId: string, skyOrderId: string) {
      return db.prepare(`SELECT challenge_id AS challengeId, sky_order_id AS skyOrderId,
          owner_user_id AS ownerUserId, profile_digest AS profileDigest, device_ref AS deviceRef,
          install_receipt_sha256 AS installReceiptSha256, authority_id AS authorityId,
          key_id AS keyId, signature_algorithm AS signatureAlgorithm,
          device_public_key_sha256 AS devicePublicKeySha256, starter_pack_id AS starterPackId,
          starter_pack_version AS starterPackVersion,
          starter_pack_manifest_sha256 AS starterPackManifestSha256,
          receipt_sha256 AS receiptSha256, observed_at AS observedAt, activated_at AS activatedAt
        FROM esim_device_entitlements WHERE owner_user_id = ? AND sky_order_id = ?`)
        .bind(ownerUserId, skyOrderId).first<EsimDeviceEntitlement>();
    },

    async attestedGatewayKey(identity: {
      authorityId: string; ownerUserId: string; deviceRef: string; keyId: string;
    }) {
      const row = await db.prepare(`SELECT algorithm, public_key_hex AS publicKeyHex,
          public_key_sha256 AS publicKeySha256, status
        FROM esim_device_gateway_keys
        WHERE authority_id = ? AND owner_user_id = ? AND device_ref = ? AND key_id = ?`)
        .bind(identity.authorityId, identity.ownerUserId, identity.deviceRef, identity.keyId)
        .first<{ algorithm: string; publicKeyHex: string; publicKeySha256: string; status: string }>();
      if (!row || row.status !== 'active' || row.algorithm !== 'ES256' ||
          row.publicKeySha256 !== identity.keyId || !/^04[a-f0-9]{128}$/.test(row.publicKeyHex)) return null;
      const rawPublicKey = Uint8Array.from(row.publicKeyHex.match(/.{2}/g)!, (byte) => Number.parseInt(byte, 16));
      const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(rawPublicKey).buffer as ArrayBuffer));
      const actualFingerprint = Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actualFingerprint !== identity.keyId) return null;
      return {
        algorithm: 'ES256' as const,
        publicKey: rawPublicKey,
        publicKeySha256: row.publicKeySha256,
      };
    },

    async gatewayKeyById(keyId: string) {
      return db.prepare(`SELECT authority_id AS authorityId, owner_user_id AS ownerUserId,
          device_ref AS deviceRef, key_id AS keyId, public_key_sha256 AS publicKeySha256, status
        FROM esim_device_gateway_keys WHERE key_id = ?`)
        .bind(keyId).first<{
          authorityId: string; ownerUserId: string; deviceRef: string; keyId: string;
          publicKeySha256: string; status: 'active' | 'revoked';
        }>();
    },

    async saveEntitlement(
      entitlement: EsimDeviceEntitlement & { nonceSha256: string },
      now: number,
      attestedKey?: AttestedEsimDeviceGatewayKey,
    ) {
      const existing = await this.entitlementByOrder(entitlement.ownerUserId, entitlement.skyOrderId);
      if (existing) {
        if (existing.deviceRef === entitlement.deviceRef &&
            existing.receiptSha256 === entitlement.receiptSha256)
          return 'already_active' as const;
        return 'entitlement_conflict' as const;
      }
      const statements = [];
      if (attestedKey) {
        statements.push(db.prepare(`INSERT OR IGNORE INTO esim_device_gateway_keys
          (authority_id,owner_user_id,device_ref,key_id,algorithm,public_key_hex,public_key_sha256,
           application_package,minimum_application_version,signing_certificate_sha256,
           security_level,verified_boot_state,attested_at,status,revoked_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,'active',NULL
          WHERE EXISTS (SELECT 1 FROM esim_device_gateway_challenges c
            JOIN esim_device_install_receipts i ON i.sky_order_id = c.sky_order_id
              AND i.owner_user_id = c.owner_user_id AND i.profile_digest = c.profile_digest
              AND i.device_ref = c.device_ref AND i.receipt_sha256 = c.install_receipt_sha256
            JOIN esim_provider_orders p ON p.sky_order_id = c.sky_order_id
              AND p.owner_user_id = c.owner_user_id AND p.profile_digest = c.profile_digest
              AND p.state = 'profile_bound'
            JOIN sky_commerce_orders o ON o.id = c.sky_order_id
              AND o.buyer_user_id = c.owner_user_id AND o.mode = 'live'
              AND o.status = 'paid' AND o.refunded_minor = 0
            WHERE c.id = ? AND c.owner_user_id = ? AND c.sky_order_id = ?
              AND c.profile_digest = ? AND c.device_ref = ? AND c.install_receipt_sha256 = ?
              AND c.nonce_sha256 = ? AND c.consumed_at IS NULL AND c.expires_at > ?)
            AND NOT EXISTS (SELECT 1 FROM esim_device_gateway_keys g WHERE g.key_id = ?)`)
          .bind(attestedKey.authorityId, attestedKey.ownerUserId, attestedKey.deviceRef,
            attestedKey.keyId, attestedKey.algorithm, attestedKey.publicKeyHex,
            attestedKey.publicKeySha256, attestedKey.applicationPackage,
            attestedKey.minimumApplicationVersion, attestedKey.signingCertificateSha256,
            attestedKey.securityLevel, attestedKey.verifiedBootState, attestedKey.attestedAt,
            entitlement.challengeId, entitlement.ownerUserId, entitlement.skyOrderId,
            entitlement.profileDigest, entitlement.deviceRef, entitlement.installReceiptSha256,
            entitlement.nonceSha256, now, attestedKey.keyId));
      }
      const keyCondition = attestedKey
        ? ` AND EXISTS (SELECT 1 FROM esim_device_gateway_keys g WHERE g.authority_id = ?
            AND g.owner_user_id = ? AND g.device_ref = ? AND g.key_id = ?
            AND g.public_key_sha256 = ? AND g.status = 'active')`
        : '';
      const entitlementInsert = db.prepare(`INSERT OR IGNORE INTO esim_device_entitlements
          (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,install_receipt_sha256,
           authority_id,key_id,signature_algorithm,device_public_key_sha256,
           starter_pack_id,starter_pack_version,starter_pack_manifest_sha256,
           receipt_sha256,observed_at,activated_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?
          WHERE EXISTS (
            SELECT 1 FROM esim_device_gateway_challenges c
            JOIN esim_device_install_receipts i ON i.sky_order_id = c.sky_order_id
              AND i.owner_user_id = c.owner_user_id AND i.profile_digest = c.profile_digest
              AND i.device_ref = c.device_ref AND i.receipt_sha256 = c.install_receipt_sha256
            JOIN esim_provider_orders p ON p.sky_order_id = c.sky_order_id
              AND p.owner_user_id = c.owner_user_id AND p.profile_digest = c.profile_digest
              AND p.state = 'profile_bound'
            JOIN sky_commerce_orders o ON o.id = c.sky_order_id
              AND o.buyer_user_id = c.owner_user_id AND o.mode = 'live'
              AND o.status = 'paid' AND o.refunded_minor = 0
            WHERE c.id = ? AND c.owner_user_id = ? AND c.sky_order_id = ?
              AND c.profile_digest = ? AND c.device_ref = ?
              AND c.install_receipt_sha256 = ? AND c.starter_pack_id = ?
              AND c.starter_pack_version = ? AND c.starter_pack_manifest_sha256 = ?
              AND c.nonce_sha256 = ? AND c.consumed_at IS NULL AND c.expires_at > ?
          ) AND NOT EXISTS (
            SELECT 1 FROM esim_device_entitlements e WHERE e.sky_order_id = ?
          )${keyCondition}`)
          .bind(entitlement.challengeId, entitlement.skyOrderId, entitlement.ownerUserId,
            entitlement.profileDigest, entitlement.deviceRef, entitlement.installReceiptSha256,
            entitlement.authorityId, entitlement.keyId, entitlement.signatureAlgorithm,
            entitlement.devicePublicKeySha256, entitlement.starterPackId,
            entitlement.starterPackVersion, entitlement.starterPackManifestSha256,
            entitlement.receiptSha256, entitlement.observedAt, entitlement.activatedAt,
            entitlement.challengeId, entitlement.ownerUserId, entitlement.skyOrderId,
            entitlement.profileDigest, entitlement.deviceRef, entitlement.installReceiptSha256,
            entitlement.starterPackId, entitlement.starterPackVersion,
            entitlement.starterPackManifestSha256, entitlement.nonceSha256, now,
            entitlement.skyOrderId,
            ...(attestedKey ? [attestedKey.authorityId, attestedKey.ownerUserId,
              attestedKey.deviceRef, attestedKey.keyId, attestedKey.publicKeySha256] : []));
      const entitlementInsertIndex = statements.length;
      statements.push(entitlementInsert);
      statements.push(db.prepare(`UPDATE esim_device_gateway_challenges SET consumed_at = ?
          WHERE id = ? AND owner_user_id = ? AND sky_order_id = ? AND consumed_at IS NULL
            AND EXISTS (SELECT 1 FROM esim_device_entitlements e
              WHERE e.challenge_id = ? AND e.receipt_sha256 = ?)`)
          .bind(now, entitlement.challengeId, entitlement.ownerUserId,
            entitlement.skyOrderId, entitlement.challengeId, entitlement.receiptSha256));
      const results = await db.batch(statements);
      const entitlementInserted = results[entitlementInsertIndex]?.meta.changes === 1;
      const saved = await this.entitlementByOrder(entitlement.ownerUserId, entitlement.skyOrderId);
      if (saved?.challengeId === entitlement.challengeId && saved.receiptSha256 === entitlement.receiptSha256)
        if (attestedKey && !await this.attestedGatewayKey(attestedKey)) return 'gateway_key_conflict' as const;
      if (saved?.challengeId === entitlement.challengeId && saved.receiptSha256 === entitlement.receiptSha256)
        return entitlementInserted ? 'activated' as const : 'already_active' as const;
      if (saved?.deviceRef === entitlement.deviceRef) return 'already_active' as const;
      return 'challenge_unavailable' as const;
    },
  };
}
