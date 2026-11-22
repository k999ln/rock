import type { SimProof } from './sim-proof.ts';

type Database = Pick<D1Database, 'prepare' | 'batch'>;
type Binding = { id: string; boundAt: number; revokedAt: number | null };

const bindingColumns = 'id, bound_at AS boundAt, revoked_at AS revokedAt';

export function simProofStore(db: Database) {
  return {
    async bind(owner: string, proof: SimProof, now: number): Promise<Binding | null> {
      // D1 executes this batch in one transaction. The partial unique index
      // arbitrates concurrent binds across owners, and the read covers retries.
      const [, active] = await db.batch<Binding>([
        db.prepare(`INSERT INTO sim_bindings (id, owner_user_id, sim_digest, device_digest, bound_at)
          SELECT ?, ?, ?, ?, ? WHERE NOT EXISTS (
            SELECT 1 FROM sim_bindings WHERE sim_digest = ? AND revoked_at >= ?
          ) ON CONFLICT(sim_digest) WHERE revoked_at IS NULL DO NOTHING`)
          .bind(crypto.randomUUID(), owner, proof.simDigest, proof.deviceDigest, now,
            proof.simDigest, proof.issuedAt),
        db.prepare(`SELECT ${bindingColumns} FROM sim_bindings
          WHERE sim_digest = ? AND owner_user_id = ? AND device_digest = ? AND revoked_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM sim_bindings WHERE sim_digest = ? AND revoked_at >= ?)`)
          .bind(proof.simDigest, owner, proof.deviceDigest, proof.simDigest, proof.issuedAt),
      ]);
      return active.results[0] ?? null;
    },

    revoke(owner: string, id: string, now: number): Promise<Binding | null> {
      return db.prepare(`UPDATE sim_bindings SET revoked_at = COALESCE(revoked_at, MAX(bound_at, ?))
        WHERE id = ? AND owner_user_id = ? RETURNING ${bindingColumns}`)
        .bind(now, id, owner).first<Binding>();
    },

    async matches(owner: string, proof: SimProof): Promise<boolean> {
      const match = await db.prepare(`SELECT 1 AS verified FROM sim_bindings AS active
        WHERE active.owner_user_id = ? AND active.sim_digest = ? AND active.device_digest = ?
          AND active.revoked_at IS NULL AND NOT EXISTS (
            SELECT 1 FROM sim_bindings AS previous
            WHERE previous.sim_digest = active.sim_digest AND previous.revoked_at >= ?
          )`).bind(owner, proof.simDigest, proof.deviceDigest, proof.issuedAt).first();
      return match !== null;
    },
  };
}
