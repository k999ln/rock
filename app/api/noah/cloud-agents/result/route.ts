import { env } from 'cloudflare:workers';
import { database } from '@/lib/fund-store';
import { createNoahCloudResultApi } from '@/lib/noah-cloud-api';
export const POST = (request: Request) => createNoahCloudResultApi({ db: database(), receiptKey: (env as unknown as { NOAH_CLOUD_KEY?: string }).NOAH_CLOUD_KEY })(request);
