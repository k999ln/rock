import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { parseNoahShelfFlags } from './noah-shelf';
/** 棚の入口の依存（lib/noah-intake-server.ts と同じ読み方）。環境変数を読むのは、この file だけ。 */
export function noahShelfDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser, now: Date.now, waitUntil,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    flags: parseNoahFlags(config), shelfFlags: parseNoahShelfFlags(config) };
}
