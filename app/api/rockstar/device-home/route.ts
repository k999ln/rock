import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import { hasActiveRockstarEntitlementIssuer, rockstarEntitlementStore } from '@/lib/rockstar-entitlement-claim';
import { rockstarServiceScopeAllowed } from '@/lib/rockstar-service-access';
import { RemoteAiTextStore } from '@/lib/remote-ai-text-store';
import { remoteAiTextQueueState } from '@/lib/remote-ai-text-http';
import { remoteAiTextExecutionAvailable } from '@/lib/remote-ai-pricing-gate';
import { REMOTE_AI_TEXT_RATE_CARD_SCHEMA } from '@/lib/remote-ai-rate-card';
import { workStore } from '@/lib/work-store';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import { describeRockstarServiceOfferProfile } from '@/lib/rockstar-service-offers';

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

/** Compact owner-only service home for the RockstarOS device shell. Never returns prompts or credentials. */
export async function GET(request: Request) {
  try {
    const db = database();
    const owner = await requestRockstarUser(request, db);
    const runtime = env as unknown as { ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED?: string; SKY_REMOTE_LLM_ENABLED?: string; OPENAI_API_KEY?: string; REMOTE_AI_TEXT_INPUT_ENCRYPTION_KEY?: string; ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string; ROCKSTAR_SERVICE_OFFER_PROFILES?: string };
    const entitlementRequired = runtime.ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED;
    const entitlements = await rockstarEntitlementStore(db).list(owner);
    const [llmAllowed, skyAllowed, zemaAllowed, agentsAllowed] = await Promise.all([
      rockstarServiceScopeAllowed(db, owner, 'rockstaros_access', entitlementRequired),
      rockstarServiceScopeAllowed(db, owner, 'sky', entitlementRequired),
      rockstarServiceScopeAllowed(db, owner, 'zema', entitlementRequired),
      rockstarServiceScopeAllowed(db, owner, 'agents', entitlementRequired),
    ]);
    const llmStore = new RemoteAiTextStore(db);
    const llm = llmAllowed ? await llmStore.list(owner) : [];
    const parentJobs = zemaAllowed
      ? (await workStore(db).list(owner))
          .filter((job) => job.status === 'active' || job.status === 'review')
          .slice(0, 20)
          .map(({ id, title, status, revision, updatedAt }) => ({ id, title, status, revision, updatedAt }))
      : [];
    const agentRows = agentsAllowed ? await db.prepare(`SELECT id, parent_job_id AS parentJobId,
      target_agent_name AS agentName, target_agent_version AS agentVersion, state, remote_state AS remoteState,
      budget_currency AS currency, budget_limit_minor AS maximumChargeMinor, deadline_at AS deadlineAt,
      revision, created_at AS createdAt, updated_at AS updatedAt,
      (SELECT s.sequence FROM a2a_live_usage_snapshots s WHERE s.owner_user_id = d.owner_user_id
        AND s.delegation_id = d.id ORDER BY s.sequence DESC LIMIT 1) AS liveUsageSequence,
      (SELECT s.currency FROM a2a_live_usage_snapshots s WHERE s.owner_user_id = d.owner_user_id
        AND s.delegation_id = d.id ORDER BY s.sequence DESC LIMIT 1) AS liveUsageCurrency,
      (SELECT s.cumulative_amount_minor FROM a2a_live_usage_snapshots s WHERE s.owner_user_id = d.owner_user_id
        AND s.delegation_id = d.id ORDER BY s.sequence DESC LIMIT 1) AS liveCumulativeAmountMinor,
      (SELECT s.pricing_version FROM a2a_live_usage_snapshots s WHERE s.owner_user_id = d.owner_user_id
        AND s.delegation_id = d.id ORDER BY s.sequence DESC LIMIT 1) AS livePricingVersion,
      (SELECT s.received_at FROM a2a_live_usage_snapshots s WHERE s.owner_user_id = d.owner_user_id
        AND s.delegation_id = d.id ORDER BY s.sequence DESC LIMIT 1) AS liveUsageReceivedAt
      FROM agent_delegations d WHERE d.owner_user_id = ? ORDER BY d.created_at DESC, d.id DESC LIMIT 20`)
      .bind(owner).all<Record<string, unknown>>() : { results: [] as Record<string, unknown>[] };
    const profileRegistry = runtime.ROCKSTAR_SERVICE_OFFER_PROFILES && entitlements.some((item) => item.status === 'active')
      ? await skyToolPackageStore(db).listRegistry() : [];
    const response = {
      schema: 'rockstar-device-home/1',
      generatedAt: Date.now(),
      access: {
        rockstaros: llmAllowed, sky: skyAllowed, zema: zemaAllowed, agents: agentsAllowed,
      },
      entitlements: await Promise.all(entitlements.slice(0, 20).map(async ({ issuerId, claimId, offerId, formFactor, scopes, status, expiresAt }, index) => {
        const profile = status === 'active' && index < 5 ? await describeRockstarServiceOfferProfile(
          issuerId, offerId, runtime.ROCKSTAR_SERVICE_OFFER_PROFILES, profileRegistry,
        ) : null;
        return { issuerId, claimId, offerId, formFactor, scopes, status, expiresAt,
          serviceProfile: profile ? { ...profile, packages: profile.packages.slice(0, 4) } : null };
      })),
      claimRedemptionAvailable: hasActiveRockstarEntitlementIssuer(runtime.ROCKSTAR_SERVICE_CLAIM_ISSUERS),
      execution: {
        cloudLlmAvailable: remoteAiTextExecutionAvailable(runtime),
        invoiceVerified: false,
        fundedWallet: false,
    },
    recentLlm: await Promise.all(llm.slice(0, 20).map(async (item) => ({
      id: item.id, state: item.state, model: item.quote.ceiling.modelId,
      queueState: remoteAiTextQueueState(item, Boolean(await llmStore.getInput(owner, item.id))),
      spending: {
        ...(item.observation?.liveMeter && typeof item.observation.liveMeter === 'object' ? {
          currentEstimateMinor: Number.isSafeInteger((item.observation.liveMeter as Record<string, unknown>).estimatedChargeMinor)
            ? (item.observation.liveMeter as Record<string, number>).estimatedChargeMinor : null,
          estimateUpdatedAt: Number.isSafeInteger((item.observation.liveMeter as Record<string, unknown>).observedAt)
            ? (item.observation.liveMeter as Record<string, number>).observedAt : null,
          estimateBasis: (item.observation.liveMeter as Record<string, unknown>).basis ===
            'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3'
            ? 'quoted_input_upper_bound_plus_output_utf8_bytes_divided_by_3' : null,
        } : { currentEstimateMinor: null, estimateUpdatedAt: null, estimateBasis: null }),
        status: item.state === 'completed' && item.price?.status === 'priced' ? 'itemized_usage_priced'
          : ['reserved', 'sending', 'unreconciled'].includes(item.state) ? 'usage_not_yet_final' : 'not_running',
          currency: item.quote.ceiling.currency,
          currentChargeMinor: item.state === 'completed' && item.price?.status === 'priced' ? item.settledMinor : null,
          reservedMaximumMinor: ['reserved', 'sending', 'unreconciled'].includes(item.state)
            ? item.quote.ceiling.maximumChargeMinor : 0,
          providerMeter: item.state === 'completed' && item.price?.status === 'priced' ? 'final_response_usage'
            : item.observation?.liveMeter ? 'stream_estimate' : 'not_reported',
          invoiceVerified: false,
        },
        currency: item.quote.ceiling.currency, maximumChargeMinor: item.quote.ceiling.maximumChargeMinor,
        rateCard: {
          pricingVersion: item.verifiedRate.card.pricingVersion,
          currency: item.verifiedRate.card.currency,
          inputMinorMicrosPerMillionTokens: item.verifiedRate.card.inputMinorMicrosPerMillionTokens,
          outputMinorMicrosPerMillionTokens: item.verifiedRate.card.outputMinorMicrosPerMillionTokens,
          ...(item.verifiedRate.card.schema === REMOTE_AI_TEXT_RATE_CARD_SCHEMA ? {
            cachedInputMinorMicrosPerMillionTokens: item.verifiedRate.card.cachedInputMinorMicrosPerMillionTokens,
            cacheWriteMinorMicrosPerMillionTokens: item.verifiedRate.card.cacheWriteMinorMicrosPerMillionTokens,
          } : {}),
          sourceUrl: item.verifiedRate.card.sourceUrl,
          unit: 'millionths_of_currency_minor_unit_per_million_tokens',
        },
        settledMinor: item.settledMinor, updatedAt: item.updatedAt,
        result: item.saveResult && item.resultText ? item.resultText.slice(0, 1_000) : null,
        resultSaved: item.saveResult && item.resultText !== null,
        resultPath: `/api/llm/quotes/${item.id}`,
        itemizedPrice: item.price,
        invoiceVerified: false,
      }))),
      parentJobs,
      recentAgents: (agentRows.results ?? []).map((item) => ({
        ...item,
        usageIsProvisional: item.liveCumulativeAmountMinor !== null && item.liveCumulativeAmountMinor !== undefined,
        statusPath: `/api/sky/a2a-delegations/${String(item.id)}`,
        resultPath: `/api/sky/a2a-delegations/${String(item.id)}/artifacts`,
      })),
      refreshAfterSeconds: 15,
    };
    const serialized = JSON.stringify(response);
    if (new TextEncoder().encode(serialized).byteLength > 24_000)
      return json({ error: 'DEVICE_HOME_TOO_LARGE' }, 503);
    return new Response(serialized, { headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    } });
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401
      : error instanceof Error && error.message === 'ORIGIN' ? 403 : 503;
    return json({ error: status === 401 ? 'UNAUTHORIZED' : 'DEVICE_HOME_UNAVAILABLE' }, status);
  }
}
