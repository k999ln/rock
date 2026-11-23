import { env } from 'cloudflare:workers';
import { database } from './fund-store';
import { noahAllowed, parseNoahFlags } from './noah-flags';
import { readNoahDirectory } from './noah-agent-directory';
import { noahRevenueDirectory } from './noah-revenue-directory';
import { noahCloudSupported } from './noah-cloud-contract';
import { withNoahCloudAvailability } from './noah-project-api';
import { noahVerifiedDirectory, mergeNoahVerifiedDirectory } from './noah-verified-directory';
export async function noahAgentDirectory() {
  const config = env as unknown as Record<string, string | undefined> & {
    BUCKET?: R2Bucket;
  };
  const listed = noahAllowed(parseNoahFlags(config), 'list', false);
  const [collected, revenue, verified] = await Promise.all([
    readNoahDirectory({ db: database(), bucket: config.BUCKET, listed }),
    listed ? noahRevenueDirectory() : Promise.resolve([]),
    listed ? noahVerifiedDirectory() : Promise.resolve([]),
  ]);
  const cloudEnabled = listed && Boolean(config.NOAH_CLOUD_URL && config.NOAH_CLOUD_KEY);
  return [...withNoahCloudAvailability(mergeNoahVerifiedDirectory(collected, verified), cloudEnabled, noahCloudSupported(config.NOAH_CLOUD_MODE)), ...revenue];
}
