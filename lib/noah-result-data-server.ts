import { env } from 'cloudflare:workers';
import { database, requestUser } from './fund-store';
export function noahDataDependencies() {
  const config = env as unknown as Record<string, string | undefined>;
  return { db: database(), authenticate: requestUser, operators: config.NOAH_DATA_ADMIN_USER_IDS };
}
