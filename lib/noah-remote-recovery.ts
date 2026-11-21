import type { IntakeDependencies } from './noah-intake-sync.ts';
import { workStore } from './work-store.ts';
import { updateNoahRemoteWork } from './noah-remote-work.ts';

/** Patrol only: repair interrupted persistence without ever repeating a provider call. */
export async function recoverNoahRemote(deps: IntakeDependencies) {
  const { db } = deps,
    now = (deps.now ?? Date.now)();
  // L3 can be installed before the connection and ask migrations.
  const tables = (
    await db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('noah_connections','noah_asks')",
      )
      .all<{ name: string }>()
  ).results;
  if (!tables.some((t) => t.name === 'noah_connections'))
    return { connections: 0, asks: 0 };
  const stale = await db
    .prepare(`UPDATE noah_connections SET state='disconnected',disconnected_at=?,updated_at=?,revision=revision+1,
    error='つなぐ途中で止まりました。もう一度試してください。'
    WHERE id IN (SELECT id FROM noah_connections WHERE place='provider' AND state IN ('planned','entitling','preparing','probing') AND updated_at<? LIMIT 50)`)
    .bind(now, now, now - 30000)
    .run();
  if (!tables.some((t) => t.name === 'noah_asks'))
    return { connections: stale.meta.changes, asks: 0 };
  const works = workStore(db);
  let asks = 0;
  for (const state of ['queued', 'running']) {
    const rows = (
      await db
        .prepare(`SELECT a.id,a.owner_id,a.work_id,a.revision,a.stop_requested,c.state AS connection_state FROM noah_asks a
      JOIN noah_connections c ON c.id=a.connection_id WHERE a.finished_at IS NULL AND a.state=? AND
      (c.state='disconnected' OR a.stop_requested=1 OR ${state === 'queued' ? 'a.created_at<?' : '(a.lease_until>0 AND a.lease_until<?)'}) LIMIT 50`)
        .bind(state, state === 'queued' ? now - 60000 : now)
        .all<{
          id: string;
          owner_id: string;
          work_id: string;
          revision: number;
          stop_requested: number;
          connection_state: string;
        }>()
    ).results;
    for (const row of rows) {
      const stopped =
        row.stop_requested || row.connection_state === 'disconnected';
      const nextState = stopped
        ? 'stopped'
        : state === 'queued'
          ? 'failed'
          : 'unknown';
      const error = stopped
        ? state === 'queued'
          ? '止めました。'
          : '止めました。相手のサーバーで実行されたかは分かりません。'
        : state === 'queued'
          ? '始められませんでした。もう一度頼んでください。'
          : '結果を確かめられませんでした。相手のサーバーで実行されたかは分かりません。';
      const work = await works.get(row.owner_id, row.work_id);
      if (!work?.noahRemote) continue;
      const next = updateNoahRemoteWork(
        work,
        nextState === 'stopped' ? 'cancelled' : nextState,
        now,
        undefined,
        error,
      );
      const result = await db.batch([
        db
          .prepare(
            'UPDATE noah_asks SET state=?,finished_at=?,updated_at=?,error=?,revision=revision+1 WHERE id=? AND revision=? AND finished_at IS NULL',
          )
          .bind(nextState, now, now, error, row.id, row.revision),
        db
          .prepare(`UPDATE work_jobs SET payload=?,revision=?,updated_at=? WHERE id=? AND user_id=? AND revision=?
          AND EXISTS(SELECT 1 FROM noah_asks WHERE id=? AND revision=? AND state=? AND finished_at=?)`)
          .bind(
            JSON.stringify(next),
            next.revision,
            next.updatedAt,
            row.work_id,
            row.owner_id,
            work.revision,
            row.id,
            row.revision + 1,
            nextState,
            now,
          ),
      ]);
      asks += result[0].meta.changes;
    }
  }
  return { connections: stale.meta.changes, asks };
}
