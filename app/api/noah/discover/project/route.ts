import { noahCloudSupported } from '@/lib/noah-cloud-contract';
import { env } from 'cloudflare:workers';
import { noahAgentDirectory } from '@/lib/noah-agent-directory-server';
import { createNoahProjectApi } from '@/lib/noah-project-api';
import { noahAllowed, parseNoahFlags } from '@/lib/noah-flags';
export const GET = (request: Request) => {
  const config = env as unknown as Record<string, string | undefined>;
  return createNoahProjectApi({ directory: noahAgentDirectory, cloudProfiles: noahCloudSupported(config.NOAH_CLOUD_MODE), cloudEnabled: Boolean(config.NOAH_CLOUD_URL && config.NOAH_CLOUD_KEY), publicAsk: noahAllowed(parseNoahFlags(config), 'ask', false) })(request);
};
