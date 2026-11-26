import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createComputePlanApi } from '@/lib/noah-shared-compute-plan-api';

function handle(request: Request) {
  return createComputePlanApi({
    db: database(),
    env: env as unknown as Record<string, unknown>,
    authenticate: (req) =>
      requestUser(req, {
        allowEsimCloudIdentity: false,
        allowDeviceSession: false,
      }),
  })(request);
}
export const GET = handle;
export const POST = handle;
