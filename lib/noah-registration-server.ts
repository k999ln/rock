import { env, waitUntil } from 'cloudflare:workers';
import { database } from './fund-store';
import { createNoahRegistrationApi, parseRegistrationProviders } from './noah-registration';
export function noahRegistrationApi() {
  const config = env as unknown as Record<string, string | undefined>;
  return createNoahRegistrationApi({ db: database(), providers: parseRegistrationProviders(config.NOAH_REGISTRATION_PROVIDERS), token: config.NOAH_REGISTRATION_AGENT_TOKEN, waitUntil });
}
