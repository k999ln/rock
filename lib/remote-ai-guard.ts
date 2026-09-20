import { database } from './fund-store.ts';
import { requestUser } from './request-auth.ts';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;

export class RemoteAiGuardError extends Error {
  readonly status: number;
  readonly code: 'UNAUTHORIZED' | 'ORIGIN' | 'RATE_LIMITED';

  constructor(
    code: 'UNAUTHORIZED' | 'ORIGIN' | 'RATE_LIMITED',
    status: number,
  ) {
    super(code);
    this.name = 'RemoteAiGuardError';
    this.code = code;
    this.status = status;
  }
}

export async function authorizeRemoteAiRequest(
  request: Request,
  route: string,
) {
  let userId: string;
  try {
    userId = await requestUser(request);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNAUTHORIZED';
    if (code === 'ORIGIN') throw new RemoteAiGuardError('ORIGIN', 403);
    throw new RemoteAiGuardError('UNAUTHORIZED', 401);
  }

  const windowStartedAt = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
  const db = database();
  await db
    .prepare(
      `INSERT INTO remote_ai_rate_limits
         (user_id, route, window_started_at, request_count)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(user_id, route) DO UPDATE SET
         window_started_at = excluded.window_started_at,
         request_count = CASE
           WHEN remote_ai_rate_limits.window_started_at = excluded.window_started_at
             THEN remote_ai_rate_limits.request_count + 1
           ELSE 1
         END`,
    )
    .bind(userId, route, windowStartedAt)
    .run();
  const row = await db
    .prepare(
      `SELECT request_count AS requestCount
       FROM remote_ai_rate_limits WHERE user_id = ? AND route = ?`,
    )
    .bind(userId, route)
    .first<{ requestCount: number }>();
  if (!row || row.requestCount > MAX_REQUESTS_PER_WINDOW)
    throw new RemoteAiGuardError('RATE_LIMITED', 429);
  return userId;
}

