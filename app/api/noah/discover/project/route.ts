import { env } from 'cloudflare:workers';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { createNoahProjectApi } from '@/lib/noah-project-api';
export const GET = (request: Request) => {
  const config = env as unknown as { NOAH_CLOUD_URL?: string; NOAH_CLOUD_KEY?: string };
  return createNoahProjectApi({ directory: noahAgentDirectory, cloudEnabled: Boolean(config.NOAH_CLOUD_URL && config.NOAH_CLOUD_KEY) })(request);
};
