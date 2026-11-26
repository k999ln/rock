import { env } from 'cloudflare:workers';
import { requestUser } from '@/lib/fund-store';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { noahProfileStore } from '@/lib/noah-profile-server';
import { noahCloudRuntime } from '@/lib/noah-cloud-api';
import { createEveChatApi } from '@/lib/eve-chat-api';
function api() {
  const config = env as unknown as { NOAH_CLOUD_MODE?: string; NOAH_CLOUD_URL?: string; NOAH_CLOUD_KEY?: string };
  return createEveChatApi({ authenticate: requestUser, directory: noahAgentDirectory, authorize: noahProfileStore().authorize,
    available: config.NOAH_CLOUD_MODE === 'free' && /^https:\/\/noah-free-cloud-agents\.[a-z0-9-]+\.workers\.dev$/.test(config.NOAH_CLOUD_URL ?? '') && (config.NOAH_CLOUD_KEY?.length ?? 0) >= 32,
    runtime: noahCloudRuntime({ url: config.NOAH_CLOUD_URL, key: config.NOAH_CLOUD_KEY, timeoutMs: 55000 }),
  });
}
export const GET = (request: Request) => api()(request);
export const POST = (request: Request) => api()(request);
