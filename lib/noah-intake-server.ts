import { noahRevenueConfig } from './noah-revenue-operation';
import { noahAgentDirectory } from './noah-agent-directory-server';
import { createNoahCloudApi, noahCloudRuntime } from './noah-cloud-api';
import { createNoahProviderRuntime } from './noah-provider-runtime';
import { createNoahAvailabilityStore } from './noah-agent-availability';
import { noahProfileStore } from './noah-profile-server';
import { noahRegistrationRuntime } from './noah-registration-runtime-server';
import { env, waitUntil } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { parseNoahFlags } from './noah-flags';
import { noahPublicOrigin } from './noah-public-origin';
import { noahReviewerAccess } from './noah-reviewer';
import { NOAH_PLAN_SOURCE } from './noah-plan';
import { noahTeikibinPlanSource } from './noah-teikibin-server';
import { parseNoahShelfFlags } from './noah-shelf';
import { createNoahShelfStore } from './noah-shelf-store';
import { readNoahAgentExplanation } from './noah-explanation-source';
import { noahGeneratedPinsPublic } from './noah-pin-review';
export function noahIntakeDependencies() {
  const config = env as unknown as Record<string, string | undefined> & { BUCKET?: R2Bucket; NOAH_PINS_PUBLIC?: string };
  const access = noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES);
  const dependencies = { db: database(), revenueConfig: noahRevenueConfig(config), ...access, providerDirectory: noahAgentDirectory,
    availability: createNoahAvailabilityStore(database()),
    cloudApi: createNoahCloudApi({ authenticate: requestUser, db: database(), directory: noahAgentDirectory,
      authorize: noahProfileStore().authorize, receiptKey: config.NOAH_CLOUD_KEY,
      runtime: noahCloudRuntime({ url: config.NOAH_CLOUD_URL, key: config.NOAH_CLOUD_KEY }) }),
    flags: parseNoahFlags(config), wakeKey: config.NOAH_PATROL_WAKE_KEY,
    explainPublic: config.NOAH_EXPLAIN_PUBLIC === 'true',
    generatedPinsPublic: () => noahGeneratedPinsPublic(config.BUCKET, config),
    explainLabels: config.NOAH_EXPLAIN_LABELS === 'true',
    explainAgent: (input: Parameters<typeof readNoahAgentExplanation>[1]) => readNoahAgentExplanation(database(), input, {
      labels: config.NOAH_EXPLAIN_LABELS === 'true', connectionFallback: true,
    }),
    // 収集機（GitHub の定期実行）が、握手の済んだ系列を一覧へ入れる時の鍵（紹介の掲載と同じ。lib/noah-intake-import.ts）。
    collectorKey: config.NOAH_COLLECTION_KEY,
    origin: noahPublicOrigin(config.NOAH_ORIGIN),
    fetcher: fetch, now: Date.now, waitUntil,
    authorizeAction: noahProfileStore().authorize,
    ownerFetch: noahRegistrationRuntime().ownerFetch,
    // つなげる数を、料金ごとのカードの数にする（切り替え NOAH_PLAN_LIMITS。料金の読み方は、本人が決めるまで置かない。lib/noah-plan.ts）。
    planLimits: { open: parseNoahShelfFlags(config).planLimits, source: noahTeikibinPlanSource(config) ?? NOAH_PLAN_SOURCE },
    // 棚の、載せるかの見直し（巡回の合図の中で、10 分に 1 回まで。docs/noah/spec-110-shelf.md の 4 章）と、実績の数え直し（UTC の 1 日に 1 回。5 章）。
    shelfRecheck: async () => { const shelf = createNoahShelfStore({ db: database(), now: Date.now }); await shelf.recheckIfDue(); await shelf.rollupIfDue(); },
    providerRecheck: async () => { const provider = createNoahProviderRuntime(dependencies); await provider.sweep(); await provider.checkAvailability(); } };
  return dependencies;
}
