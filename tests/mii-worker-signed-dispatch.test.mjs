import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createWorkJob } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { makeSeed } from './fixtures/mii-worker-signed/seed.mjs';
import { outboundService, keyPair, usageKeyPair } from './fixtures/mii-worker-signed/outbound.ts';

void test('real workflow sends a signed synthetic delegation through a test-only outbound binding', { timeout: 30000 }, async t => {
  const bundled=await build({entryPoints:['tests/fixtures/mii-worker-shared/workflow-wrapper.mjs'],bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:*','node:*'],logLevel:'silent'});
  const owner='vitest-owner', parent='22222222-2222-4222-8222-222222222019', id='11111111-1111-4111-8111-111111111019', messageId='33333333-3333-4333-8333-333333333019';
  const publicHex=key=>key.publicKey.export({type:'spki',format:'der'}).subarray(-32).toString('hex');
  const privateBase64=key=>key.privateKey.export({type:'pkcs8',format:'der'}).toString('base64');
  const bindings={A2A_DELEGATION_EXECUTION_ENABLED:'true',A2A_PRICE_QUOTES_REQUIRED:'true',ROCKSTAR_SERVICE_ENTITLEMENTS_REQUIRED:'true',
    A2A_EGRESS_ALLOWED_ORIGINS:'https://a2a.example.com,https://python.a2a.example.com',A2A_TEST_OUTBOUND_REQUIRED:'true',A2A_INPUT_ENCRYPTION_KEY:'b'.repeat(64),
    A2A_TRUSTED_BROKER_KEYS:JSON.stringify([{authorityId:'vitest-authority',ownerUserId:owner,deviceRef:'vitest-device',keyId:'vitest-key',publicKeyHex:publicHex(keyPair),status:'active'}]),
    A2A_TRUSTED_USAGE_KEYS:JSON.stringify([{providerId:'vitest-provider',keyId:'vitest-usage-key',agentOrigin:'https://a2a.example.com',publicKeyHex:publicHex(usageKeyPair),status:'active'}]),
    SKY_PACKAGE_RUNTIME_EXTENSION_URI:'https://rockstar.example/extensions/sky-package-runtime/v2'};
  const worker=new Miniflare(convertV4MiniflareOptions({modules:true,host:'127.0.0.1',port:0,compatibilityDate:'2026-08-18',compatibilityFlags:['nodejs_compat'],
    d1Databases:['DB'],workflows:{A2A_DELEGATION_WORKFLOW:{name:'signed-dispatch',className:'A2ADelegationWorkflow'}},bindings,serviceBindings:{A2A_TEST_OUTBOUND:outboundService},script:bundled.outputFiles[0].text}));
  t.after(()=>worker.dispose());const db=await worker.getD1Database('DB');
  for(const lineage of ['pre-site-bridge','post-site-bridge']) {
    const dir=new URL(`../drizzle-legacy/${lineage}/`,import.meta.url);
    const files=readdirSync(dir).filter(name=>{const n=Number(name.slice(0,4));return name.endsWith('.sql')&&(n===10||n===16||(n>=19&&n<=26)||[33,39,40,41,42,43,44,46,47,48,55,56,57].includes(n));}).sort();
    for(const file of files)for(const statement of readFileSync(new URL(file,dir),'utf8').split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement.trim()).run();
  }
  await db.prepare('CREATE TABLE IF NOT EXISTS work_jobs (id TEXT PRIMARY KEY,user_id TEXT NOT NULL,payload TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL)').run();
  const job=createWorkJob({id:parent,title:'合成署名委任',templateId:'article'});await workStore(db).create(owner,job);
  const seed=makeSeed({DB:db,A2A_TEST_PRIVATE_KEY_PKCS8:privateBase64(keyPair),A2A_TEST_USAGE_PRIVATE_KEY_PKCS8:privateBase64(usageKeyPair)});
  await seed({delegationId:id,parentJobId:parent,messageId,message:'Worker mii lost remote cancellation response fixture.',budgetLimitMinor:50,parentBudgetLimitMinor:80});
  const instance=await (await worker.getBindings()).A2A_DELEGATION_WORKFLOW.create({id:`signed-${randomUUID()}`,params:{ownerUserId:owner,delegationId:id,operation:'dispatch'}});
  let state;for(let i=0;i<200;i++){state=await instance.status();if(['complete','errored'].includes(state.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(state.status,'complete',JSON.stringify(state));assert.deepEqual(state.output,{outcome:'task_received',state:'working',usageOutcome:'missing'});
  const store=a2aDelegationStore(db), delegation=await store.get(owner,id);
  assert.equal(delegation.parentJobId,parent);assert.equal(delegation.remoteTaskId,'vitest-lost-cancel-task');
  assert.equal((await store.getBudgetReservation(owner,id)).state,'held');
  const sends=await db.prepare("SELECT COUNT(*) AS n FROM agent_delegation_events WHERE delegation_id=? AND owner_user_id=? AND event_type='remote_send_claimed'").bind(id,owner).first();
  assert.equal(sends.n,1);
});
