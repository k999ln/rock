import { noahCloudSupported } from '@/lib/noah-cloud-contract';
import { env } from 'cloudflare:workers';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { createNoahProjectApi } from '@/lib/noah-project-api';
export const GET = (request: Request) => {
  const config = env as unknown as { NOAH_CLOUD_URL?: string; NOAH_CLOUD_KEY?: string; NOAH_CLOUD_MODE?: string };
  return createNoahProjectApi({ directory: noahAgentDirectory, cloudProfiles: noahCloudSupported(config.NOAH_CLOUD_MODE), cloudEnabled: Boolean(config.NOAH_CLOUD_URL && config.NOAH_CLOUD_KEY) })(request);
};
