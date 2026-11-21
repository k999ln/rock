import {
  createNoahGuardedFetch,
  noahMcpHandshake,
  noahMcpClose,
  NoahMouthError,
  type NoahMouthContext,
} from './noah-mouth-mcp-remote.ts';
import { noahFormSummary } from './noah-form.ts';
import {
  candidateTarget,
  remoteCandidate,
  touchRemoteFamily,
  REMOTE_CANDIDATE_SQL,
  type RemoteCandidate,
} from './noah-remote-candidate.ts';
import { NOAH_PATROL_BUDGET } from './noah-intake-wake.ts';
import type { IntakeDependencies } from './noah-intake-sync.ts';

export type ProbeDependencies = IntakeDependencies & {
  checkAddress?: (url: URL) => Promise<void>;
};
export function remoteContext(
  deps: ProbeDependencies,
  patrol = false,
  signal?: AbortSignal,
): NoahMouthContext {
  return {
    fetch: createNoahGuardedFetch(deps.fetcher ?? fetch, {
      sameHost: true,
      check: deps.checkAddress,
    }),
    signal,
    headers: async () => ({
      'user-agent': `${patrol ? 'NoahBot' : 'Noah'}/1 (+${deps.origin ?? 'https://avoado.si'}/noah/help#bot)`,
    }),
  };
}
export async function remoteFailure(
  deps: ProbeDependencies,
  row: RemoteCandidate,
  error: NoahMouthError,
) {
  const now = (deps.now ?? Date.now)();
  if (error.code === 'rate_limited') {
    await deps.db
      .prepare(`INSERT INTO noah_probe_hosts(host,last_probe_at,not_before) VALUES(?,0,?)
      ON CONFLICT(host) DO UPDATE SET not_before=MAX(not_before,excluded.not_before)`)
      .bind(row.host, now + Number(error.detail.retryAfterSeconds ?? 60) * 1000)
      .run();
  }
  if (error.code === 'auth_required' || error.code === 'payment_required') {
    await deps.db
      .prepare(`UPDATE noah_intake_checks SET level=0,result=?,auth=?,next_check_at=?
      WHERE candidate_id=? AND connect_sha256=?`)
      .bind(
        error.code,
        error.code === 'payment_required' ? 'payment' : 'unknown',
        now + 30 * 86400000,
        row.id,
        row.connect_sha256,
      )
      .run();
    await touchRemoteFamily(deps.db, row.family_id, now);
  }
}
export function createNoahProbe(deps: ProbeDependencies) {
  const { db } = deps,
    now = deps.now ?? Date.now;
  async function probeL1(row: RemoteCandidate) {
    const at = now(),
      context = remoteContext(deps, true, AbortSignal.timeout(12000));
    let result = 'ok';
    try {
      const { url } = candidateTarget(row);
      const handshake = await noahMcpHandshake(url, context);
      const connected =
        (await db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='noah_connections'",
          )
          .first()) &&
        (await db
          .prepare(
            "SELECT 1 FROM noah_connections WHERE family_key=? AND state='connected' LIMIT 1",
          )
          .bind(row.family_id)
          .first());
      const summary = noahFormSummary(handshake.tools),
        level = handshake.tools.length ? Math.max(1, row.level) : 0;
      result = handshake.tools.length ? 'ok' : 'incompatible';
      await db
        .prepare(`UPDATE noah_intake_checks SET result=?,auth='none',level=?,tools_sha256=?,tool_count=?,read_only=?,
        form_tools=?,one_tap_tools=?,latency_ms=?,l1_at=COALESCE(l1_at,?),checked_at=?,next_check_at=?,failures=0,first_failure_at=NULL,lease_until=0
        WHERE candidate_id=? AND connect_sha256=?`)
        .bind(
          result,
          level,
          handshake.toolsSha256,
          handshake.tools.length,
          Number(handshake.allReadOnly),
          summary.formTools,
          summary.oneTapTools,
          Math.max(0, now() - at),
          at,
          at,
          at + (connected ? 1 : 7) * 86400000,
          row.id,
          row.connect_sha256,
        )
        .run();
      await db
        .prepare(
          'UPDATE noah_intake_families SET hidden_at=NULL WHERE representative_id=?',
        )
        .bind(row.id)
        .run();
      await touchRemoteFamily(db, row.family_id, at);
      await noahMcpClose(handshake.session, context);
    } catch (error) {
      if (!(error instanceof NoahMouthError)) throw error;
      const failure = error;
      result = failure.code;
      const failures =
        failure.code === 'unreachable' ? row.failures + 1 : row.failures;
      const level =
        failure.code === 'rate_limited' ||
        (failure.code === 'unreachable' && failures < 2)
          ? row.level
          : 0;
      const delay =
        failure.code === 'unreachable'
          ? failures === 1
            ? 6 * 3600000
            : Math.min(30, 14 * 2 ** Math.min(failures - 2, 2)) * 86400000
          : failure.code === 'rate_limited'
            ? Number(failure.detail.retryAfterSeconds ?? 60) * 1000
            : [
                  'payment_required',
                  'too_large',
                  'blocked',
                  'auth_required',
                ].includes(failure.code)
              ? 30 * 86400000
              : 7 * 86400000;
      await remoteFailure(deps, row, failure);
      await db
        .prepare(`UPDATE noah_intake_checks SET result=?,level=?,auth=?,checked_at=?,next_check_at=?,failures=?,first_failure_at=?,lease_until=0
        WHERE candidate_id=? AND connect_sha256=?`)
        .bind(
          result,
          level,
          failure.code === 'payment_required'
            ? 'payment'
            : ['auth_required', 'forbidden'].includes(failure.code)
              ? 'unknown'
              : row.auth,
          at,
          failure.code === 'blocked' && !failure.detail.redirectedTo
            ? Number.MAX_SAFE_INTEGER
            : at + delay,
          failures,
          failures ? (row.first_failure_at ?? at) : null,
          row.id,
          row.connect_sha256,
        )
        .run();
      if (
        failures &&
        row.first_failure_at !== null &&
        at - row.first_failure_at >= 30 * 86400000
      )
        await db
          .prepare(
            'UPDATE noah_intake_families SET hidden_at=COALESCE(hidden_at,?) WHERE representative_id=?',
          )
          .bind(at, row.id)
          .run();
      await touchRemoteFamily(db, row.family_id, at);
    }
    return { id: row.id, result };
  }
  async function probeDue(start = now()) {
    const at = now(),
      budget = deps.budget ?? NOAH_PATROL_BUDGET;
    const rows = (
      await db
        .prepare(`${REMOTE_CANDIDATE_SQL} WHERE c.state='active' AND c.source='mcp-registry'
      AND f.withdrawn_at IS NULL AND f.id NOT LIKE 'bulk:%'
      AND k.mouth='mcp-remote' AND k.setup=0 AND k.next_check_at<=? AND k.lease_until<=?
      AND NOT EXISTS(SELECT 1 FROM noah_probe_hosts h WHERE h.host=c.host AND (h.last_probe_at>? OR h.not_before>?))
      ORDER BY k.next_check_at,c.id LIMIT ?`)
        .bind(at, at, at - 3600000, at, budget.probes)
        .all<RemoteCandidate>()
    ).results;
    const results: { id: string; result: string }[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(budget.concurrent, 4, rows.length) },
        async () => {
          while (
            cursor < rows.length &&
            now() - start < budget.seconds * 1000 - 12000
          ) {
            const row = rows[cursor++];
            const claimed = await db
              .prepare(`INSERT INTO noah_probe_hosts(host,last_probe_at,not_before) VALUES(?,?,0)
          ON CONFLICT(host) DO UPDATE SET last_probe_at=excluded.last_probe_at WHERE last_probe_at<=? AND not_before<=? RETURNING host`)
              .bind(row.host, at, at - 3600000, at)
              .first();
            if (!claimed) continue;
            const lease = await db
              .prepare(
                'UPDATE noah_intake_checks SET lease_until=? WHERE candidate_id=? AND lease_until<=? AND connect_sha256=? RETURNING candidate_id',
              )
              .bind(at + 30000, row.id, at, row.connect_sha256)
              .first();
            if (
              lease &&
              (await remoteCandidate(db, row.family_id))?.state === 'active'
            )
              results.push(await probeL1(row));
          }
        },
      ),
    );
    return results;
  }
  return { probeL1, probeDue };
}
