import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
/** ピンタレスト風の一覧の入口の依存（task 115）。見せてよいかは、取り込んだ一覧と同じ切り替え（NOAH_INTAKE_PUBLIC）と審査者。 */
export function noahPinsDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser, now: Date.now, waitUntil,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    flags: parseNoahFlags(config) };
}
