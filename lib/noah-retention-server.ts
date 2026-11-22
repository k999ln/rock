import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { noahReviewerAccess } from './noah-reviewer';
/** 続けて使う割合（task 103）の入口の依存。環境変数を読むのは、この file だけ。審査者は ID と本人の印の両方から読む。 */
export function noahRetentionDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), now: Date.now, ...noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES) };
}
