import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { noahPublicOrigin } from './noah-public-origin';
export function noahIntakeDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    flags: parseNoahFlags(config), wakeKey: config.NOAH_PATROL_WAKE_KEY,
    origin: noahPublicOrigin(config.NOAH_ORIGIN),
    fetcher: fetch, now: Date.now, waitUntil };
}
