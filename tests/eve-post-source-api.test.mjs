import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { postSourceFixture } from './helpers/eve-post-source-fixture.mjs';
import { loadRouteFixture } from './route-fixture.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import * as access from '../lib/community-access.ts';
import * as social from '../lib/sky-social.ts';
import * as operations from '../lib/operations.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import * as library from '../lib/sky-agent-library.ts';
import * as store from '../lib/sky-agent-library-store.ts';
import * as context from '../lib/eve-source-context-store.ts';
import * as hub from '../lib/sky-hub.ts';
import { prepareEveAgentPending,reserveEveAgentPending,reconcileEveAgentCreation,readEveAgentPending } from '../lib/eve-agent-creation.ts';

async function routes(t) {
  const f=await postSourceFixture(t);let owner=f.owner;
  const deps=new Map([['@/lib/community-access',access],['@/lib/sky-social',social],['@/lib/operations',operations],['@/lib/owner-intent',ownerIntent],['@/lib/sky-agent-library',library],['@/lib/sky-agent-library-store',store],['@/lib/eve-source-context-store',context],['@/lib/sky-hub',hub],['@/lib/fund-store',{database:()=>f.db,requestUser:async()=>{if(!owner)throw new Error('UNAUTHORIZED');return owner;}}]]);
  const source=loadRouteFixture(new URL('../app/api/eve/source-context/route.ts',import.meta.url),deps),agent=loadRouteFixture(new URL('../app/api/sky/agents/route.ts',import.meta.url),deps);
  const headers={'Origin':'https://fixture.local','Content-Type':'application/json','x-rock-community-keys':JSON.stringify(f.keys),'X-Rock-Owner-Scope':await ownerScopeFor(f.owner)};
  const get=(extra={})=>source.GET(new Request(`https://fixture.local/api/eve/source-context?key=post%3A${f.postId}`,{headers:{...headers,...extra}}));
  const put=(settings,id=randomUUID(),extra={})=>agent.PUT(new Request('https://fixture.local/api/sky/agents',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify({id,revision:0,create:true,settings})}));
  return {...f,source,agent,headers,get,put,setOwner:value=>{owner=value;}};
}
void test('source endpoint authenticates current owner, serves only selected snapshot, and never returns keys',async t=>{
  const f=await routes(t),response=await f.get();assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');const x=await response.json();
  assert.equal(x.ownerScope,await ownerScopeFor(f.owner));assert.equal(x.post.id,f.postId);assert.deepEqual(Object.keys(x).sort(),['ownerScope','post','source']);assert.equal(JSON.stringify(x).includes(f.key),false);
  assert.equal((await f.get({'x-rock-community-keys':'{}'})).status,409);assert.equal((await f.get({'x-rock-community-keys':'bad-json'})).status,400);
  f.setOwner(f.author);assert.equal((await f.get()).status,409);f.setOwner(null);assert.equal((await f.get()).status,401);
});
void test('Agent PUT uses selected community key; missing keys cannot authorize private post origin',async t=>{
  const f=await routes(t),settings=await f.settings();
  assert.equal((await f.put(settings,randomUUID(),{'x-rock-community-keys':'{}'})).status,409);assert.equal(f.count(),0);
  assert.equal((await f.put(settings,randomUUID(),{'Origin':'https://wrong.local'})).status,403);assert.equal(f.count(),0);
  const ok=await f.put(settings);assert.equal(ok.status,200);assert.deepEqual((await ok.json()).agent.origin,settings.origin);
});
void test('source revoked during actual INSERT gives definitive typed rejection and creates no Agent',async t=>{
  const f=await routes(t),settings=await f.settings();let raced=false;
  f.db.beforeRun=sql=>{if(raced||!sql.startsWith('INSERT INTO sky_agent_settings'))return;raced=true;f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();};
  const response=await f.put(settings);assert.equal(response.status,409);assert.equal((await response.json()).code,'EVE_SOURCE_CHANGED');assert.equal(f.count(),0);
});
void test('lost committed response reads back same owner/id/origin after revoke without needing key or a second write',async t=>{
  const f=await routes(t),settings=await f.settings(),id=randomUUID();let writes=0;
  const request={ownerScope:await ownerScopeFor(f.owner),id,settings};const pending=await prepareEveAgentPending(request);
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  reserveEveAgentPending(storage,pending);
  writes++;const committed=await f.put(settings,id);assert.equal(committed.status,200);
  // Simulate transport losing the committed response before parsing it.
  f.sqlite.prepare('UPDATE sky_community_keys SET revoked_at=2').run();
  const fetcher=async(path,init)=>{assert.notEqual(init?.method,'PUT');return f.agent.GET(new Request(`https://fixture.local${path}`));};
  const result=await reconcileEveAgentCreation(fetcher,pending,storage);assert.equal(result.state,'saved');assert.equal(result.agent.id,id);assert.equal(writes,1);assert.deepEqual(result.agent.origin,settings.origin);
  assert.equal(readEveAgentPending(storage,request.ownerScope),null);
  // Reconciliation is owner scoped and never needs community credentials.
  const reread=await f.agent.GET(new Request(`https://fixture.local/api/sky/agents?id=${id}`));assert.equal(reread.status,200);assert.deepEqual((await reread.json()).agent.origin,settings.origin);assert.equal(writes,1);
});
