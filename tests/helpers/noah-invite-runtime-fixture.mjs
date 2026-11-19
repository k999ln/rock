import { randomUUID, randomBytes } from 'node:crypto';
import { releaseRuntimeFixture } from './noah-release-runtime-fixture.mjs';
import { createNoahInviteApi } from '../../lib/noah-invites.ts';
import { ownerScopeFor } from '../../lib/owner-intent.ts';
import { inviteSourceLoader } from '../../scripts/noah-invite-loader.mjs';

export async function inviteRuntimeFixture() {
  const f=await releaseRuntimeFixture(), api=createNoahInviteApi(f.deps);
  const request=async(owner='author-fixture',method='GET',body)=>new Request('http://127.0.0.1:3999/api/noah/invites',{method,headers:{'test-owner':owner,origin:'http://127.0.0.1:3999','content-type':'application/json','x-rock-owner-scope':await ownerScopeFor(owner)},...(body?{body:JSON.stringify(body)}:{})});
  const issue=async(patch={})=>{
    const v={id:randomUUID(),agentId:f.id,token:randomBytes(32).toString('hex'),recipient:'buyer-fixture',access:'source',executionAllowed:true,expiresAt:Date.now()+60000,maxUses:1,...patch};
    const response=await api.create(await request('author-fixture','POST',v));
    if(!response.ok)throw new Error(JSON.stringify(await response.json()));
    return {...v,agentId:'invite-'+v.id};
  };
  const claim=async(v,owner='buyer-fixture')=>api.claim(await request(owner,'POST',{token:v.token}),v.id);
  const loader=async(v,owner='buyer-fixture')=>{
    const scope=await ownerScopeFor(owner);
    return inviteSourceLoader({headers:{host:'127.0.0.1:3999'}},scope,v.agentId,async()=>({ownerScope:scope,localHostOwner:true}),async address=>{
      const r=await request(owner);return address.endsWith('/source')?api.download(r,v.id):api.get(r,v.id);
    });
  };
  const revoke=async(v)=>api.revoke(await request('author-fixture','DELETE',{revision:1}),v.id);
  return {...f,api,request,issue,claim,loader,revoke};
}
