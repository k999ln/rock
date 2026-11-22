import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { parseNoahShelfFlags } from './noah-shelf';
import { noahReviewerAccess } from './noah-reviewer';
/** 棚の入口の依存（lib/noah-intake-server.ts と同じ読み方）。環境変数を読むのは、この file だけ。 */
export function noahShelfDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  // 審査者は、ID と本人の印（NOAH_REVIEWER_OWNER_SCOPES）の両方から読む。本番は印だけが入っていて、ID だけでは運営の操作が使えなかった。
  return { db: database(), now: Date.now, waitUntil,
    ...noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES),
    flags: parseNoahFlags(config), shelfFlags: parseNoahShelfFlags(config) };
}
