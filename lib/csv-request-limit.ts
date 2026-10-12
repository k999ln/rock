// API abuse protection; this does not throttle the external login provider.
type Database = Pick<D1Database, 'prepare'>;
export class CsvRequestLimitError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number) {
    super('RATE_LIMITED');
    this.retryAfter = retryAfter;
  }
}
export async function limitCsvRequest(
  db: Database,
  user: string,
  action: 'quote' | 'payment',
  now = Date.now(),
) {
  const duration = 60_000;
  const window = Math.floor(now / duration) * duration;
  const limit = action === 'quote' ? 10 : 20;
  // Reuse the persistent counter table with a separate fixed namespace.
  // RETURNING ties the decision to this increment, including concurrent requests.
  const row = await db
    .prepare(`INSERT INTO sky_remote_ai_rate_limits
    (user_id, route, window_started_at, request_count) VALUES (?, ?, ?, 1)
    ON CONFLICT(user_id, route) DO UPDATE SET
      window_started_at = excluded.window_started_at,
      request_count = CASE WHEN sky_remote_ai_rate_limits.window_started_at = excluded.window_started_at
        THEN sky_remote_ai_rate_limits.request_count + 1 ELSE 1 END
    RETURNING request_count AS count`)
    .bind(user, `csv:${action}`, window)
    .first<{ count: number }>();
  if (!row || row.count > limit)
    throw new CsvRequestLimitError(
      Math.max(1, Math.ceil((window + duration - now) / 1000)),
    );
}
