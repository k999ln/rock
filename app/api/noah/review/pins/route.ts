import { env } from 'cloudflare:workers';
import { noahIntakeDependencies } from '@/lib/noah-intake-server';
import { createNoahPinReviewApi, loadNoahPinReviewCandidates } from '@/lib/noah-pin-review';

const run = (request: Request) => {
  const { BUCKET: bucket } = env as unknown as { BUCKET?: R2Bucket };
  const deps = noahIntakeDependencies();
  return createNoahPinReviewApi({ ...deps, bucket, load: () => bucket ? loadNoahPinReviewCandidates(deps.db, bucket, Date.now()) : Promise.resolve([]) })(request);
};

export const GET = run;
export const POST = run;
