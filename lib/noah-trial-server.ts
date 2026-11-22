import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahShelfFlags } from './noah-shelf';
/** 試行の入口の依存（lib/noah-shelf-server.ts と同じ読み方）。環境変数を読むのは、この file だけ。 */
export function noahTrialDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser, now: Date.now,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean),
    shelfFlags: parseNoahShelfFlags(config) };
}
