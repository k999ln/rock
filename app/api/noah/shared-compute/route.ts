import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createSharedComputeApi } from '@/lib/noah-shared-compute-api';
import { noahProfileStore } from '@/lib/noah-profile-server';
import { readComputeBillingScope } from '@/lib/noah-shared-compute-plan';

function handle(request: Request) {
  const config = env as unknown as Record<string, unknown>;
  const scope = readComputeBillingScope(config);
  return createSharedComputeApi({
    db: database(),
    authorize: noahProfileStore().authorizeRevision,
    authenticate: (req) =>
      requestUser(req, {
        allowEsimCloudIdentity: false,
        allowDeviceSession: false,
      }),
    scope:
      scope?.mode === 'live' &&
      config.NOAH_COMPUTE_LIVE_DEVICE_ACCEPTANCE !== 'approved'
        ? null
        : scope,
  })(request);
}

export const GET = handle;
export const POST = handle;
