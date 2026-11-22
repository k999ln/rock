import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahShelfFlags } from './noah-shelf';
import { noahReviewerAccess } from './noah-reviewer';
/** 試行の入口の依存（lib/noah-shelf-server.ts と同じ読み方）。環境変数を読むのは、この file だけ。 */
export function noahTrialDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  // 審査者は、ID と本人の印（NOAH_REVIEWER_OWNER_SCOPES）の両方から読む（lib/noah-shelf-server.ts と同じ）。
  return { db: database(), now: Date.now,
    ...noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES),
    shelfFlags: parseNoahShelfFlags(config) };
}
