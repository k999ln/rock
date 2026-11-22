import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahReleaseApi } from './noah-release';
import { noahReviewerAccess } from './noah-reviewer';
export function noahReleaseDependencies() {
  const config = env as unknown as { BUCKET?: R2Bucket; SKY_PAYMENTS_MODE?: string; NOAH_REVIEWER_USER_IDS?: string; NOAH_REVIEWER_OWNER_SCOPES?: string; ROCKSTAR_SERVICE_OFFER_PROFILES?: string };
  const mode: 'test'|'live'|undefined = config.SKY_PAYMENTS_MODE === 'test' || config.SKY_PAYMENTS_MODE === 'live' ? config.SKY_PAYMENTS_MODE : undefined;
  // 審査者は、ID と本人の印（NOAH_REVIEWER_OWNER_SCOPES）の両方から読む（lib/noah-reviewer.ts）。
  return { db: database(), bucket: config.BUCKET, serviceOfferProfiles: config.ROCKSTAR_SERVICE_OFFER_PROFILES,
    ...noahReviewerAccess(requestUser, config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES), mode };
}
export function noahReleaseApi() { return createNoahReleaseApi(noahReleaseDependencies()); }
