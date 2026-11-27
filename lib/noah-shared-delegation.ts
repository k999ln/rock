import type { NoahProfile } from './noah-profile-contract.ts';
import { ownerScopeFor } from './owner-intent.ts';
import { SHARED_WORKLOAD_VERSION } from './noah-shared-workload.ts';

import { EVE_WORKLOAD } from './noah-eve-participant.ts';

type SharedAction = 'connect' | 'run';
type Database = Pick<D1Database, 'prepare' | 'batch'>;
const blocked = (profile: NoahProfile, action: SharedAction, target: string) =>
  profile.paused ||
  profile.grants.some(
    (g) => g.target === target && g.action === action && g.mode === 'deny',
  );

// Write the stop to the same database as admissions and receipts, before acknowledging
// the encrypted profile change. A raced/failed R2 write can require fresh consent;
// it can never restore a revoked token or admit a stale profile revision.
export function sharedDelegationStop(db: Database) {
  return async (
    user: string,
    previous: NoahProfile,
    next: NoahProfile,
    now: number,
  ) => {
    const actions = (['connect', 'run'] as const).flatMap((action) => {
      const blocksNow = (target: string) =>
        !blocked(previous, action, target) && blocked(next, action, target);
      if (blocksNow(SHARED_WORKLOAD_VERSION))
        return [{ action, onlyEve: false }];
      return blocksNow(EVE_WORKLOAD) ? [{ action, onlyEve: true }] : [];
    });
    if (!actions.length) return;
    // Archived/other Site lineages may provide profiles without any compute tables.
    // Partial installations fail closed below. A site with no participants has nothing to stop.
    const installed = await db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name IN
      ('noah_compute_delegation_fences','noah_compute_jobs','noah_compute_devices') LIMIT 1`)
      .first();
    if (!installed) return;
    const owner = await ownerScopeFor(user);
    const statements: D1PreparedStatement[] = [];
    for (const { action, onlyEve } of actions) {
      const jobFilter = onlyEve ? " AND workload='eve-agent-chain-v1'" : '';
      const hostFilter = onlyEve
        ? " AND consent_version='eve-participant-v1'"
        : '';
      statements.push(
        db
          .prepare(`INSERT INTO noah_compute_delegation_fences(owner_scope,action,min_revision) VALUES (?,?,?)
        ON CONFLICT(owner_scope,action) DO UPDATE SET min_revision=max(min_revision,excluded.min_revision)`)
          .bind(onlyEve ? 'eve/' + owner : owner, action, next.revision),
      );
      if (action === 'run') {
        statements.push(
          db
            .prepare(`UPDATE noah_compute_jobs SET status='cancelled',finished_at=?
          WHERE owner_scope=? AND profile_revision<? AND status IN ('queued','leased')${jobFilter}`)
            .bind(now, owner, next.revision),
        );
      } else {
        statements.push(
          db
            .prepare(`UPDATE noah_compute_jobs SET lease_until=?,status=CASE WHEN attempts>=3 THEN 'expired' ELSE 'queued' END
          WHERE status='leased' AND device_id IN (SELECT id FROM noah_compute_devices WHERE owner_scope=? AND profile_revision<?${hostFilter})`)
            .bind(now, owner, next.revision),
        );
        statements.push(
          db
            .prepare(`UPDATE noah_compute_devices SET revoked_at=?
          WHERE owner_scope=? AND profile_revision<? AND revoked_at IS NULL${hostFilter}`)
            .bind(now, owner, next.revision),
        );
      }
    }
    await db.batch(statements);
  };
}
