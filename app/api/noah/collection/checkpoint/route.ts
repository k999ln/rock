import { env, waitUntil } from 'cloudflare:workers';
import { createCollectorCheckpointApi } from '@/lib/noah-collector-checkpoint';
export const POST = (request: Request) => {
  const config = env as unknown as { BUCKET?: R2Bucket; NOAH_COLLECTION_KEY?: string };
  return createCollectorCheckpointApi({ bucket: config.BUCKET, key: config.NOAH_COLLECTION_KEY, waitUntil })(request);
};
