import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { createNoahFirstEarningApi } from '@/lib/noah-first-earning-api';
import { noahReviewerAccess } from '@/lib/noah-reviewer';

function handle(request: Request) {
  const config = env as unknown as Record<string, string | undefined>;
  return createNoahFirstEarningApi({
    db: database(),
    open: config.NOAH_FIRST_EARNING === 'true',
    ...noahReviewerAccess(
      (req) => requestUser(req, { allowEsimCloudIdentity: false, allowDeviceSession: false }),
      config.NOAH_REVIEWER_USER_IDS, config.NOAH_REVIEWER_OWNER_SCOPES,
    ),
  })(request);
}

export const GET = handle;
export const POST = handle;
