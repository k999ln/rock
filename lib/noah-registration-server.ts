import { env, waitUntil } from 'cloudflare:workers';
import { noahProfileStore } from './noah-profile-server';
import { registrationProfileResolver } from './noah-registration-profile';
import { database, requestUser } from './fund-store';
import { createNoahRegistrationApi, parseRegistrationProviders } from './noah-registration';
import { noahRegistrationRuntime } from './noah-registration-runtime-server';
export function noahRegistrationApi() {
  const config = env as unknown as Record<string, string | undefined>;
  const runtime=noahRegistrationRuntime();
  return createNoahRegistrationApi({ db: database(), providers: [...parseRegistrationProviders(config.NOAH_REGISTRATION_PROVIDERS).filter(p=>p.execution!=='browser'&&!runtime.providers.some(v=>v.id===p.id)),...runtime.providers], executor:runtime.executor, token: config.NOAH_REGISTRATION_AGENT_TOKEN, waitUntil, resolveProfile:registrationProfileResolver(noahProfileStore(),requestUser) });
}
