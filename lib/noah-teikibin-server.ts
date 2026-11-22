import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { noahReviewerAccess } from './noah-reviewer';
import { parseNoahTeikibinFlags } from './noah-teikibin';
import { createNoahTeikibinStore } from './noah-teikibin-store';

/**
 * 定期便の台帳の入口の依存（task 123）。環境変数を読むのは、この file だけ。
 * 審査者は NOAH_REVIEWER_USER_IDS と NOAH_REVIEWER_OWNER_SCOPES の両方から読む（本番は後者だけが入っている）。
 */
export function noahTeikibinDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return {
    db: database(),
    now: Date.now,
    flags: parseNoahTeikibinFlags(config),
    ...noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES),
  };
}

/** 有料かどうかの読み方（spec-123 の 8.4 章）。切り替え NOAH_TEIKIBIN が閉の間は null（今までどおり、読み方なし）。 */
export function noahTeikibinPlanSource(config: Record<string, string | undefined>) {
  return parseNoahTeikibinFlags(config).open ? createNoahTeikibinStore({ db: database(), now: Date.now }).paidPlan : null;
}
