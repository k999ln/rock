import type { NoahExternalAccountStore } from './noah-external-account-store.ts';
import type { ConfiguredRegistration } from './noah-registration.ts';
import type { RegistrationAvailability } from './noah-registration-contract.ts';
import {canonicalJson,sha256Hex} from './noah-connect-requirements.ts';
/** Only an availability flag leaves the encrypted, owner-bound store. */
export function createRegistrationAccountStates({store,authenticate,now=Date.now}:{store:NoahExternalAccountStore;authenticate:(r:Request)=>Promise<string>;now?:()=>number}){
 return async(request:Request,providers:ConfiguredRegistration[])=>{
  const states:Record<string,RegistrationAvailability>={};
  let owner:string;try{owner=await authenticate(request);}catch{return states;}
  for(const provider of providers){
   if(!provider.requiresAccount)continue;
   try{const {account}=await store.load(owner,provider.id);
    if(account&&provider.execution==='browser'&&account.configurationDigest!==await sha256Hex(canonicalJson(provider))){states[provider.id]='unavailable';continue;}
    if(account?.state==='ready'&&account.credential)states[provider.id]='ready';
    else if(account?.state==='failed'&&account.retryAt&&account.retryAt>now())states[provider.id]={accountState:'cooldown',retryAt:account.retryAt};
    else if(account&&account.state!=='failed')states[provider.id]='pending';
   }catch{states[provider.id]='unavailable';}
  }
  return states;
 };
}
