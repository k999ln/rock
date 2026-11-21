import { env } from 'cloudflare:workers';
import { requestUser } from './fund-store';
import { profileKeys } from './noah-profile-store';
import { createNoahExternalAccountStore } from './noah-external-account-store';
import { AGENTBOARD_PROVIDER,createNoahNativeRegistration } from './noah-registration-native';
import { createNoahRegisteredMcpFetch } from './noah-registered-mcp';
import { createNoahBrowserRegistration } from './noah-browser-registration';
import { parseRegistrationProviders } from './noah-registration';
export function noahRegistrationRuntime(){
  const config=env as unknown as {BUCKET?:R2Bucket;NOAH_PROFILE_KEYS?:string;NOAH_REGISTRATION_NATIVE?:string;NOAH_REGISTRATION_PROVIDERS?:string;NOAH_REGISTRATION_BROWSER_URL?:string;NOAH_REGISTRATION_BROWSER_KEY?:string};
  const store=createNoahExternalAccountStore(config.BUCKET,profileKeys(config.NOAH_PROFILE_KEYS));
  const enabled=config.NOAH_REGISTRATION_NATIVE==='agentboard'&&store.available;
  const configured=parseRegistrationProviders(config.NOAH_REGISTRATION_PROVIDERS);
  const browser=createNoahBrowserRegistration({url:config.NOAH_REGISTRATION_BROWSER_URL,key:config.NOAH_REGISTRATION_BROWSER_KEY,providers:configured,store,authenticate:requestUser});
  const native=enabled?createNoahNativeRegistration({store,authenticate:requestUser,observe:event=>console.info('noah_registration_native',event)}):undefined;
  return {providers:[...(enabled?[AGENTBOARD_PROVIDER]:[]),...configured.filter(p=>p.execution==='browser'&&browser.available&&p.executorUrl===config.NOAH_REGISTRATION_BROWSER_URL)],executor:async(request:Request,provider:import('./noah-registration').ConfiguredRegistration)=>(await browser.executor(request,provider))??(await native?.(request,provider)),
    browserControl:browser.control,
    ownerFetch:async(owner:string,url:string)=>browser.ownerFetch(owner,url)??(enabled?createNoahRegisteredMcpFetch({owner,url,store,fetcher:fetch}):fetch)};
}
