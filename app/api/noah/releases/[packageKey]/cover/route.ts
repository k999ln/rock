import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createNoahPublisherApi } from '@/lib/noah-publisher';
export async function GET(request: Request, context: { params: Promise<{ packageKey: string }> }) {
  const api = createNoahPublisherApi({ db: database(), authenticate: requestUser, bucket: (env as unknown as { BUCKET?: R2Bucket }).BUCKET });
  return api.cover(request, (await context.params).packageKey);
}
