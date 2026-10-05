type Database = Pick<D1Database, 'prepare' | 'batch'>;

export type EsimInstallChallenge = {
  id: string;
  skyOrderId: string;
  ownerUserId: string;
  profileDigest: string;
  deviceRef: string;
  nonceSha256: string;
  createdAt: number;
  expiresAt: number;
  consumedAt: number | null;
};

export type EsimVerifiedInstallReceipt = {
  challengeId: string;
  skyOrderId: string;
  ownerUserId: string;
  profileDigest: string;
  deviceRef: string;
  issuerId: string;
  keyId: string;
  receiptSha256: string;
  evidenceSource: 'carrier_privileged' | 'oem_euicc_controller';
  observedAt: number;
  verifiedAt: number;
};

export function esimDeviceInstallStore(db: Database) {
  return {
    async activeChallengeCount(ownerUserId: string, skyOrderId: string, now: number) {
      const row = await db.prepare(`SELECT COUNT(*) AS count FROM esim_device_install_challenges
        WHERE owner_user_id = ? AND sky_order_id = ? AND consumed_at IS NULL AND expires_at > ?`)
        .bind(ownerUserId, skyOrderId, now).first<{ count: number }>();
      return row?.count ?? 0;
    },

    async createChallenge(challenge: EsimInstallChallenge) {
      await db.prepare(`INSERT INTO esim_device_install_challenges
        (id,sky_order_id,owner_user_id,profile_digest,device_ref,nonce_sha256,created_at,expires_at,consumed_at)
        VALUES (?,?,?,?,?,?,?,?,NULL)`)
        .bind(challenge.id, challenge.skyOrderId, challenge.ownerUserId, challenge.profileDigest,
          challenge.deviceRef, challenge.nonceSha256, challenge.createdAt, challenge.expiresAt).run();
    },

    async challenge(ownerUserId: string, skyOrderId: string, id: string) {
      return db.prepare(`SELECT id, sky_order_id AS skyOrderId, owner_user_id AS ownerUserId,
          profile_digest AS profileDigest, device_ref AS deviceRef, nonce_sha256 AS nonceSha256,
          created_at AS createdAt, expires_at AS expiresAt, consumed_at AS consumedAt
        FROM esim_device_install_challenges WHERE id = ? AND owner_user_id = ? AND sky_order_id = ?`)
        .bind(id, ownerUserId, skyOrderId).first<EsimInstallChallenge>();
    },

    async receiptByOrder(ownerUserId: string, skyOrderId: string) {
      return db.prepare(`SELECT challenge_id AS challengeId, sky_order_id AS skyOrderId,
          owner_user_id AS ownerUserId, profile_digest AS profileDigest, device_ref AS deviceRef,
          issuer_id AS issuerId, key_id AS keyId, receipt_sha256 AS receiptSha256,
          evidence_source AS evidenceSource, observed_at AS observedAt, verified_at AS verifiedAt
        FROM esim_device_install_receipts WHERE owner_user_id = ? AND sky_order_id = ?`)
        .bind(ownerUserId, skyOrderId).first<EsimVerifiedInstallReceipt>();
    },

    async saveVerifiedReceipt(
      receipt: EsimVerifiedInstallReceipt & { challengeNonceSha256: string },
      now: number,
    ) {
      const existing = await this.receiptByOrder(receipt.ownerUserId, receipt.skyOrderId);
      if (existing) {
        if (existing.profileDigest === receipt.profileDigest && existing.deviceRef === receipt.deviceRef)
          return 'already_verified' as const;
        return 'device_conflict' as const;
      }
      const results = await db.batch([
        db.prepare(`INSERT OR IGNORE INTO esim_device_install_receipts
          (challenge_id,sky_order_id,owner_user_id,profile_digest,device_ref,issuer_id,key_id,
           receipt_sha256,evidence_source,observed_at,verified_at)
          SELECT ?,?,?,?,?,?,?,?,?,?,?
          WHERE EXISTS (
            SELECT 1 FROM esim_device_install_challenges c
            WHERE c.id = ? AND c.owner_user_id = ? AND c.sky_order_id = ?
              AND c.profile_digest = ? AND c.device_ref = ? AND c.nonce_sha256 = ?
              AND c.consumed_at IS NULL AND c.expires_at > ?
          ) AND NOT EXISTS (
            SELECT 1 FROM esim_device_install_receipts r WHERE r.sky_order_id = ?
          )`)
          .bind(receipt.challengeId, receipt.skyOrderId, receipt.ownerUserId, receipt.profileDigest,
            receipt.deviceRef, receipt.issuerId, receipt.keyId, receipt.receiptSha256,
            receipt.evidenceSource, receipt.observedAt, receipt.verifiedAt,
            receipt.challengeId, receipt.ownerUserId, receipt.skyOrderId, receipt.profileDigest,
            receipt.deviceRef, receipt.challengeNonceSha256, now,
            receipt.skyOrderId),
        db.prepare(`UPDATE esim_device_install_challenges SET consumed_at = ?
          WHERE id = ? AND owner_user_id = ? AND sky_order_id = ? AND consumed_at IS NULL
            AND EXISTS (SELECT 1 FROM esim_device_install_receipts r
              WHERE r.challenge_id = ? AND r.receipt_sha256 = ?)`)
          .bind(now, receipt.challengeId, receipt.ownerUserId, receipt.skyOrderId,
            receipt.challengeId, receipt.receiptSha256),
      ]);
      const saved = await this.receiptByOrder(receipt.ownerUserId, receipt.skyOrderId);
      if (saved?.challengeId === receipt.challengeId && saved.receiptSha256 === receipt.receiptSha256)
        return results[0]?.meta.changes === 1 ? 'verified' as const : 'already_verified' as const;
      if (saved?.profileDigest === receipt.profileDigest && saved.deviceRef === receipt.deviceRef)
        return 'already_verified' as const;
      return 'challenge_unavailable' as const;
    },
  };
}
