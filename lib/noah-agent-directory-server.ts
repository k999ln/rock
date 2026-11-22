import { env } from 'cloudflare:workers';
import { database } from './fund-store';
import { noahAllowed, parseNoahFlags } from './noah-flags';
import { readNoahDirectory } from './noah-agent-directory';
export function noahAgentDirectory() {
  const config = env as unknown as Record<string, string | undefined> & { BUCKET?: R2Bucket };
  return readNoahDirectory({ db: database(), bucket: config.BUCKET, listed: noahAllowed(parseNoahFlags(config), 'list', false) });
}
