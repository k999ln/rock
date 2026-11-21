import { env } from 'cloudflare:workers';
import { createNoahChurnApi } from '@/lib/noah-churn-api';
import { requestUser } from '@/lib/request-auth';

export function GET(request: Request) {
  const config = env as unknown as Record<string, string | undefined>;
  return createNoahChurnApi({
    authenticate: requestUser,
    reviewers: (config.NOAH_REVIEWER_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean),
    billingUrl: config.BILLING_SERVICE_URL,
    secret: config.BILLING_CHURN_SHARED_SECRET,
  })(request);
}
