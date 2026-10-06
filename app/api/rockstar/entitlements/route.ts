import { env } from 'cloudflare:workers';
import { esimCloudAccessStore } from '@/lib/esim-cloud-access';
import { database } from '@/lib/fund-store';
import { requestRockstarUser } from '@/lib/rockstar-device-link';
import {
  rockstarEntitlementStore,
  hasActiveRockstarEntitlementIssuer,
  trustedRockstarEntitlementIssuerKeyResolver,
  verifyRockstarEntitlementClaim,
} from '@/lib/rockstar-entitlement-claim';
import { skyToolPackageStore } from '@/lib/sky-tool-package-store';
import { describeRockstarServiceOfferProfile } from '@/lib/rockstar-service-offers';

const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  try {
    const ownerUserId = await requestRockstarUser(request, database());
    const db = database();
    const runtime = env as unknown as { ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string; ROCKSTAR_SERVICE_OFFER_PROFILES?: string };
    const entitlements = await rockstarEntitlementStore(db).list(ownerUserId);
    const profilesConfigured = typeof runtime.ROCKSTAR_SERVICE_OFFER_PROFILES === 'string' &&
      runtime.ROCKSTAR_SERVICE_OFFER_PROFILES.length > 0;
    const registry = profilesConfigured && entitlements.some((item) => item.status === 'active')
      ? await skyToolPackageStore(db).listRegistry() : [];
    return json({
      entitlements: await Promise.all(entitlements.map(async (item) => ({
        ...item,
        serviceProfile: item.status === 'active' ? await describeRockstarServiceOfferProfile(
          item.issuerId, item.offerId, runtime.ROCKSTAR_SERVICE_OFFER_PROFILES, registry,
        ) : null,
      }))),
      esimAccess: await esimCloudAccessStore(db, env).listActive(ownerUserId),
      claimRedemptionAvailable: hasActiveRockstarEntitlementIssuer(runtime.ROCKSTAR_SERVICE_CLAIM_ISSUERS),
    });
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHORIZED' ? 401
      : error instanceof Error && error.message === 'ORIGIN' ? 403 : 503;
    return json({ error: status === 401 ? 'Rockstar IDでサインインしてください。' : '利用権を取得できませんでした。' }, status);
  }
}

export async function POST(request: Request) {
  try {
    const ownerUserId = await requestRockstarUser(request, database());
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 16_384) return json({ error: 'claimが大きすぎます。' }, 413);
    const input = JSON.parse(raw) as Record<string, unknown>;
    const claim = await verifyRockstarEntitlementClaim(
      input.claim,
      input.claimCode,
      trustedRockstarEntitlementIssuerKeyResolver(
        (env as unknown as { ROCKSTAR_SERVICE_CLAIM_ISSUERS?: string }).ROCKSTAR_SERVICE_CLAIM_ISSUERS,
      ),
    );
    if (!claim) return json({ error: '購入claimを確認できませんでした。販売元またはコードを確認してください。' }, 400);
    const entitlement = await rockstarEntitlementStore(database()).claim(
      claim,
      input.claimCode as string,
      ownerUserId,
    );
    const profiles = (env as unknown as { ROCKSTAR_SERVICE_OFFER_PROFILES?: string }).ROCKSTAR_SERVICE_OFFER_PROFILES;
    const registry = profiles ? await skyToolPackageStore(database()).listRegistry() : [];
    const serviceProfile = await describeRockstarServiceOfferProfile(claim.issuerId, claim.offerId, profiles, registry);
    return json({ entitlement: { ...entitlement, serviceProfile } }, entitlement.alreadyClaimed ? 200 : 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return json({ error: 'Rockstar IDでサインインしてください。' }, 401);
    if (error instanceof Error && error.message === 'ORIGIN') return json({ error: 'RockstarOSから操作してください。' }, 403);
    if (error instanceof SyntaxError) return json({ error: 'claimの形式を確認してください。' }, 400);
    if (error instanceof Error && error.message === 'CLAIM_ALREADY_USED') return json({ error: 'この購入claimは別のRockstar IDで使用済みです。' }, 409);
    if (error instanceof Error && error.message === 'CLAIM_REVOKED') return json({ error: 'この購入claimは販売元で取消済みです。新しい案内をご確認ください。' }, 409);
    return json({ error: '購入claimを登録できませんでした。' }, 503);
  }
}
