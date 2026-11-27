import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { createComputeWebhook } from '@/lib/noah-shared-compute-plan-api';

export function POST(request: Request) {
  return createComputeWebhook({
    db: database(),
    env: env as unknown as Record<string, unknown>,
  })(request);
}
