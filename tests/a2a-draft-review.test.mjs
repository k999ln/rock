import test from 'node:test';
import assert from 'node:assert/strict';
import { eveAgentFixture } from './helpers/eve-agent-fixture.mjs';
import { eveAgentWorkStore } from '../lib/eve-agent-work.ts';
import { eveHistoryStore } from '../lib/eve-history.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { createA2AIntentDigests } from '../lib/a2a-authorization.ts';
import { encryptA2AInput } from '../lib/a2a-input-crypto.ts';
import { readA2ADraftReview } from '../lib/a2a-draft-review.ts';
const owner = 'draft-owner', key = 'ab'.repeat(32);
async function setup(t) {
  const f = eveAgentFixture(t), eve = eveAgentWorkStore(f.db, owner, f.keys);
  const parent = (await eve.create({ create:true,jobId:crypto.randomUUID(),threadId:crypto.randomUUID(),title:'合成の承認待ち再開' })).job;
  const request = { id:crypto.randomUUID(),parentJobId:parent.id,idempotencyKey:crypto.randomUUID(),messageId:crypto.randomUUID(),targetOrigin:'https://agent.example.com',targetAgentName:'draft-agent',targetAgentVersion:'1.0.0',protocolVersion:'1.0',message:'Synthetic private draft for review only.',budgetCurrency:'USD',budgetLimitMinor:0,parentBudgetLimitMinor:0,continueWhileDeviceOffline:true,deadlineAt:Date.now()+120000 };
  const digests = await createA2AIntentDigests({...request,ownerUserId:owner});
  const store = a2aDelegationStore(f.db), d = (await store.prepare(owner,{...request,...digests})).delegation;
  const encrypted = await encryptA2AInput(request.message,key,owner,d.id,digests.inputSha256);
  await store.savePendingInput(owner,d.id,d.revision,encrypted);
  return {...f,eve,parent,request,d,store,encrypted};
}
void test('encrypted pending input survives store reopen without approval/reservation and existing approval atomically replaces the same input',async t=>{
  const f=await setup(t), review=await readA2ADraftReview(f.db,owner,f.d.id,key);
  assert.equal(review.request.message,f.request.message); assert.equal(review.request.messageId,f.request.messageId);
  assert.equal(review.authorizationSha256,f.d.authorizationSha256);
  assert.equal((await f.store.get(owner,f.d.id)).state,'awaiting_approval');
  assert.equal(await f.store.getBudgetReservation(owner,f.d.id),null);
  assert.equal(await f.store.claimDispatch(owner,f.d.id),null);
  const input=await f.store.getInput(owner,f.d.id); assert.ok(!input.ciphertext.includes('Synthetic'));
  await f.store.savePendingInput(owner,f.d.id,f.d.revision,f.encrypted);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM agent_delegation_inputs').get().n,1);
  const approved=await f.store.approve(owner,f.d.id,f.d.authorizationSha256,await encryptA2AInput(f.request.message,key,owner,f.d.id,f.d.inputSha256));
  assert.equal(approved.state,'prepared'); assert.equal((await f.store.getBudgetReservation(owner,f.d.id)).state,'held');
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key),e=>e.status===409);
});
void test('pending review and storage reject other owners, changed hashes, stale revision and parent stop without reviving a delegation',async t=>{
  const f=await setup(t);
  await assert.rejects(readA2ADraftReview(f.db,'other',f.d.id,key),e=>e.status===404);
  await assert.rejects(f.store.savePendingInput('other',f.d.id,f.d.revision,f.encrypted));
  await assert.rejects(f.store.savePendingInput(owner,f.d.id,f.d.revision+1,f.encrypted));
  await assert.rejects(f.store.savePendingInput(owner,f.d.id,f.d.revision,{...f.encrypted,inputSha256:'f'.repeat(64)}));
  await f.eve.command({jobId:f.parent.id,revision:f.parent.revision,commandId:crypto.randomUUID(),action:'stop'});
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key),e=>e.status===409);
  await assert.rejects(f.store.savePendingInput(owner,f.d.id,f.d.revision,f.encrypted));
  assert.equal((await f.store.get(owner,f.d.id)).state,'cancelled_before_dispatch');
  assert.equal(await f.store.claimDispatch(owner,f.d.id),null);
});
void test('missing/corrupt keys, condition tampering and deleted conversation never expose or overwrite pending plaintext',async t=>{
  const f=await setup(t);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id),e=>e.status===503);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,'cd'.repeat(32)));
  f.sqlite.prepare('UPDATE agent_delegations SET authorization_sha256=? WHERE id=?').run('e'.repeat(64),f.d.id);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key),e=>e.status===409);
  const history=eveHistoryStore(f.db,owner,f.keys,true), item=await history.get(f.parent.eveAgent.threadId);
  await history.remove(f.parent.eveAgent.threadId,item.revision);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key),e=>e.status===410);
});
void test('expired and legacy missing input stay explicit and do not create another draft or reservation',async t=>{
  const f=await setup(t);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key,f.d.deadlineAt),e=>e.status===409);
  await f.store.deleteInput(owner,f.d.id);
  await assert.rejects(readA2ADraftReview(f.db,owner,f.d.id,key),e=>e.status===409);
  assert.equal((await f.store.get(owner,f.d.id)).state,'awaiting_approval');
  assert.equal(await f.store.getBudgetReservation(owner,f.d.id),null);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM agent_delegations').get().n,1);
});

void test('a stop committed while encrypted review is being prepared is refused by the final persisted state fence',async t=>{
  const f=await setup(t);
  const db={...f.db,prepare(query){
    if(query.startsWith('SELECT d.id FROM agent_delegations d')) {
      const row=f.sqlite.prepare('SELECT payload FROM work_jobs WHERE id=?').get(f.parent.id), parent=JSON.parse(row.payload);
      parent.eveAgent.stopRequestedAt=Date.now(); parent.revision++;
      f.sqlite.prepare('UPDATE work_jobs SET payload=?,revision=? WHERE id=?').run(JSON.stringify(parent),parent.revision,parent.id);
    }
    return f.db.prepare(query);
  }};
  await assert.rejects(readA2ADraftReview(db,owner,f.d.id,key),e=>e.status===409);
  assert.equal(await f.store.getBudgetReservation(owner,f.d.id),null);
  assert.equal(await f.store.claimDispatch(owner,f.d.id),null);
});
