import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
export function noahIntakeDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  const flags = parseNoahFlags(config);
  return {
    db: database(),
    budget: flags.patrolBudget,
    authenticate: requestUser,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    flags,
    wakeKey: config.NOAH_PATROL_WAKE_KEY,
    origin: config.NOAH_ORIGIN
      ? `https://${config.NOAH_ORIGIN}`
      : 'https://avoado.si',
    fetcher: fetch,
    now: Date.now,
    waitUntil,
  };
}
