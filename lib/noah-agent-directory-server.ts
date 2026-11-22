import { env } from 'cloudflare:workers';
import { database } from './fund-store';
import { noahAllowed, parseNoahFlags } from './noah-flags';
import { readNoahDirectory } from './noah-agent-directory';
import { noahRevenueDirectory } from './noah-revenue-directory';
export async function noahAgentDirectory() {
  const config = env as unknown as Record<string, string | undefined> & {
    BUCKET?: R2Bucket;
  };
  const listed = noahAllowed(parseNoahFlags(config), 'list', false);
  const [collected, revenue] = await Promise.all([
    readNoahDirectory({ db: database(), bucket: config.BUCKET, listed }),
    listed ? noahRevenueDirectory() : Promise.resolve([]),
  ]);
  return [...collected, ...revenue];
}
