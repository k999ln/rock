import { env } from 'cloudflare:workers';
import { requestUser } from './fund-store';
import { createNoahProfileApi } from './noah-profile-api';
import { createNoahProfileStore, profileKeys } from './noah-profile-store';
import { sharedDelegationStop } from './noah-shared-delegation';

export function noahProfileStore() {
  const config = env as unknown as {
    BUCKET?: R2Bucket;
    DB?: D1Database;
    NOAH_PROFILE_KEYS?: string;
  };
  return createNoahProfileStore(
    config.BUCKET,
    profileKeys(config.NOAH_PROFILE_KEYS),
    Date.now,
    config.DB ? sharedDelegationStop(config.DB) : undefined,
  );
}

export const noahProfileApi = () => createNoahProfileApi({
  store: noahProfileStore(), authenticate: requestUser,
});
