import { env } from 'cloudflare:workers';
import { requestUser } from './request-auth';
import { createNoahBrowserSessionApi, createNoahBrowserSessions } from './noah-browser-session';
import { profileKeys } from './noah-profile-store';

export function noahSessionApi() {
  const config = env as unknown as { NOAH_PROFILE_KEYS?: string };
  return createNoahBrowserSessionApi({
    authenticate: requestUser,
    sessions: createNoahBrowserSessions(profileKeys(config.NOAH_PROFILE_KEYS)),
  });
}
