import { env } from 'cloudflare:workers';
import { requestUser } from './fund-store';
import { profileKeys } from './noah-profile-store';
import { createNoahExternalAccountStore } from './noah-external-account-store';
import { AGENTBOARD_PROVIDER,createNoahNativeRegistration } from './noah-registration-native';
import { createNoahRegisteredMcpFetch } from './noah-registered-mcp';
export function noahRegistrationRuntime(){
  const config=env as unknown as {BUCKET?:R2Bucket;NOAH_PROFILE_KEYS?:string;NOAH_REGISTRATION_NATIVE?:string};
  const store=createNoahExternalAccountStore(config.BUCKET,profileKeys(config.NOAH_PROFILE_KEYS));
  const enabled=config.NOAH_REGISTRATION_NATIVE==='agentboard'&&store.available;
  return {providers:enabled?[AGENTBOARD_PROVIDER]:[],executor:enabled?createNoahNativeRegistration({store,authenticate:requestUser}):undefined,
    ownerFetch:enabled?(owner:string,url:string)=>createNoahRegisteredMcpFetch({owner,url,store,fetcher:fetch}):undefined};
}
