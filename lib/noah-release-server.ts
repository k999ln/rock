import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
import { createNoahReleaseApi } from './noah-release';
export function noahReleaseDependencies() {
  const config = env as unknown as { BUCKET?: R2Bucket; SKY_PAYMENTS_MODE?: string; NOAH_REVIEWER_USER_IDS?: string; ROCKSTAR_SERVICE_OFFER_PROFILES?: string };
  const mode: 'test'|'live'|undefined = config.SKY_PAYMENTS_MODE === 'test' || config.SKY_PAYMENTS_MODE === 'live' ? config.SKY_PAYMENTS_MODE : undefined;
  return { db: database(), authenticate: requestUser, bucket: config.BUCKET, serviceOfferProfiles: config.ROCKSTAR_SERVICE_OFFER_PROFILES,
    reviewers:(config.NOAH_REVIEWER_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean), mode };
}
export function noahReleaseApi() { return createNoahReleaseApi(noahReleaseDependencies()); }
