import { noahProfileStore } from './noah-profile-server';
import { noahRegistrationRuntime } from './noah-registration-runtime-server';
import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { noahPublicOrigin } from './noah-public-origin';
import { noahReviewerAccess } from './noah-reviewer';
import { NOAH_PLAN_SOURCE } from './noah-plan';
import { parseNoahShelfFlags } from './noah-shelf';
import { createNoahShelfStore } from './noah-shelf-store';
export function noahIntakeDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  const access = noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES);
  return { db: database(), ...access,
    flags: parseNoahFlags(config), wakeKey: config.NOAH_PATROL_WAKE_KEY,
    collectorKey: config.NOAH_COLLECTION_KEY,
    origin: noahPublicOrigin(config.NOAH_ORIGIN),
    fetcher: fetch, now: Date.now, waitUntil,
    authorizeAction: noahProfileStore().authorize,
    ownerFetch: noahRegistrationRuntime().ownerFetch,
    // つなげる数を、料金ごとのカードの数にする（切り替え NOAH_PLAN_LIMITS。料金の読み方は、本人が決めるまで置かない。lib/noah-plan.ts）。
    planLimits: { open: parseNoahShelfFlags(config).planLimits, source: NOAH_PLAN_SOURCE },
    // 棚の、載せるかの見直し（巡回の合図の中で、10 分に 1 回まで。docs/noah/spec-110-shelf.md の 4 章）と、実績の数え直し（UTC の 1 日に 1 回。5 章）。
    shelfRecheck: async () => { const shelf = createNoahShelfStore({ db: database(), now: Date.now }); await shelf.recheckIfDue(); await shelf.rollupIfDue(); } };
}
