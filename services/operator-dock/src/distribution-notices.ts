// A committed assignment is its own durable outbox row. Polling and retry use
// the same private Noah work ID and never pass the address or procurement data.
type Notice = { id: string; recipient: string; attempts: number };
export type NoticeBinding = {
  fetch(input: string, init: RequestInit): Promise<Response>;
};
export async function deliverNotices(
  db: D1Database,
  binding: NoticeBinding | undefined,
  now = Date.now(),
) {
  if (!binding) return;
  const due = await db
    .prepare(
      "SELECT id,recipient,attempts FROM distribution_assignments WHERE notice_state IN ('queued','waiting') AND next_attempt<=? ORDER BY next_attempt,id LIMIT 30",
    )
    .bind(now)
    .all<Notice>();
  for (const row of due.results) {
    const ask = (action: string) =>
      binding.fetch('https://notice.invalid/' + action, {
        method: 'POST',
        body: JSON.stringify({ id: row.id, owner: row.recipient }),
      });
    let state = 'waiting',
      result: string | null = null,
      time: number | null = null,
      usage: number | null = null;
    try {
      let response = await ask('state');
      if (response.status === 404) response = await ask('start');
      if (response.status === 403) state = 'stopped';
      else if (response.ok) {
        const job = (await response.json()) as {
          id?: string;
          state?: string;
          resultId?: string;
          readyAt?: number;
          usageYen?: number;
        };
        if (job.id !== row.id) state = 'attention';
        else if (job.state === 'completed') {
          if (
            job.resultId === 'notice:' + row.id &&
            Number.isSafeInteger(job.readyAt) &&
            job.readyAt! > 0 &&
            job.usageYen === 0
          ) {
            state = 'ready';
            result = job.resultId;
            time = job.readyAt!;
            usage = 0;
          } else state = 'attention';
        } else if (job.state === 'attention' || job.state === 'stopped')
          state = job.state;
      } else if (response.status < 500 && response.status !== 429)
        state = 'attention';
    } catch {
      /* A lost response is reconciled through the same assignment. */
    }
    const next = now + Math.min(60_000, 500 * 2 ** Math.min(7, row.attempts));
    await db
      .prepare(`UPDATE distribution_assignments SET notice_state=?,next_attempt=?,attempts=attempts+1,result_id=?,ready_at=?,usage_yen=?
      WHERE id=? AND notice_state IN ('queued','waiting') AND attempts=?`)
      .bind(state, next, result, time, usage, row.id, row.attempts)
      .run();
  }
}
