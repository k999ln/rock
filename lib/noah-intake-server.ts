import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { createNoahShelfStore } from './noah-shelf-store';
export function noahIntakeDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    flags: parseNoahFlags(config), wakeKey: config.NOAH_PATROL_WAKE_KEY,
    origin: config.NOAH_ORIGIN ? `https://${config.NOAH_ORIGIN}` : 'https://avoado.si',
    fetcher: fetch, now: Date.now, waitUntil,
    // 棚の、載せるかの見直し（巡回の合図の中で、10 分に 1 回まで。docs/noah/spec-110-shelf.md の 4 章）。
    shelfRecheck: () => createNoahShelfStore({ db: database(), now: Date.now }).recheckIfDue() };
}
