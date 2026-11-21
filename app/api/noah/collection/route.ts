import { env } from 'cloudflare:workers';
import { createCollectionApi } from '@/lib/noah-collection-api';
const api = () => {
  const config = env as unknown as { BUCKET?: R2Bucket; NOAH_COLLECTION_KEY?: string };
  return createCollectionApi({ bucket: config.BUCKET, key: config.NOAH_COLLECTION_KEY });
};
export const GET = (request: Request) => api()(request);
export const POST = (request: Request) => api()(request);
