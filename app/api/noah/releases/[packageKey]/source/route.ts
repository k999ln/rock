import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createNoahReleaseApi } from '@/lib/noah-release';
export async function GET(request: Request, context: { params: Promise<{ packageKey: string }> }) {
  const { packageKey } = await context.params;
  const config = env as unknown as { BUCKET?: R2Bucket; SKY_PAYMENTS_MODE?: string; ROCKSTAR_SERVICE_OFFER_PROFILES?: string };
  return createNoahReleaseApi({ db: database(), authenticate: requestUser, bucket: config.BUCKET,
    serviceOfferProfiles: config.ROCKSTAR_SERVICE_OFFER_PROFILES,
    mode: config.SKY_PAYMENTS_MODE === 'test' || config.SKY_PAYMENTS_MODE === 'live' ? config.SKY_PAYMENTS_MODE : undefined }).download(request, packageKey);
}
