import { env } from 'cloudflare:workers';
import { database, requestUser } from '@/lib/fund-store';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { noahProfileStore } from '@/lib/noah-profile-server';
import { createNoahCloudApi, noahCloudRuntime } from '@/lib/noah-cloud-api';
function api() {
  const config = env as unknown as { NOAH_CLOUD_URL?: string; NOAH_CLOUD_KEY?: string };
  return createNoahCloudApi({ authenticate: requestUser, db: database(), directory: noahAgentDirectory, authorize: noahProfileStore().authorize, receiptKey: config.NOAH_CLOUD_KEY, runtime: noahCloudRuntime({ url: config.NOAH_CLOUD_URL, key: config.NOAH_CLOUD_KEY }) });
}
export const GET = (request: Request) => api()(request);
export const POST = (request: Request) => api()(request);
