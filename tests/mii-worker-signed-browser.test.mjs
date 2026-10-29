import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { loadRouteFixture } from './route-fixture.mjs';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { createWorkJob } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { makeSeed } from './fixtures/mii-worker-signed/seed.mjs';
import { outboundService, keyPair, usageKeyPair } from './fixtures/mii-worker-signed/outbound.ts';

const chrome=process.env.ROCK_TEST_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);
void test('two mii tabs, lost remote cancellation and signed usage share the same job', {timeout:60000,skip:!chrome && 'Chrome unavailable'}, async t => {
  const dir=await mkdtemp(join(tmpdir(),'mii-worker-signed-'));t.after(()=>rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200}));
  const root=new URL('..',import.meta.url).pathname, ownerScope=await ownerScopeFor('vitest-owner');
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
  const job=createWorkJob({id:parent,title:'合成署名委任',templateId:'article'});job.agentBinding={schema:'rockstaros.work-agent-binding/1',agentId:'fixture-role',agentRevision:1,requestDigest:'a'.repeat(64)};await workStore(db).create(owner,job);
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
  const env={}; const deps=new Map([['cloudflare:workers',{env}],['@/lib/fund-store',{database:()=>db,requestUser:async()=>owner}]]);
  for (const name of ['bounded-stream','owner-intent','a2a-delegation-store','work-store','sky-agent-library-store','rockstar-service-access','workflow']) deps.set(`@/lib/${name}`,await import(new URL(`../lib/${name}.ts`,import.meta.url)));
  for (const name of ['a2a-authorization','a2a-price-quote','a2a-usage-receipt','jennifer-execution-store','jennifer-amc-execution','a2a-agent-directory','sky-package-runtime','sky-tool-package-store','sky-package-runtime-binding','sky-package-runtime-binding-store']) deps.set(`@/lib/${name}`,{});
  deps.set('@/lib/a2a-parent-controller',await import('../lib/a2a-parent-controller.ts'));
  deps.set('@/lib/rockstar-device-link',{requestRockstarUser:async()=>owner});
  const route=loadRouteFixture(new URL('../app/api/work-jobs/route.ts',import.meta.url),deps);
  const delegationRoute=loadRouteFixture(new URL('../app/api/sky/a2a-delegations/route.ts',import.meta.url),deps);
  const ui=await build({entryPoints:['tests/fixtures/mii-worker-shared/mii-ui.tsx'],bundle:true,write:false,platform:'browser',jsx:'automatic',logLevel:'silent',plugins:[{name:'aliases',setup(builder){
    builder.onResolve({filter:/^@\/lib\/mii-preview-descriptors$/},()=>({path:join(root,'tests/fixtures/eve-smith-mii-browser/mii-preview-descriptors.ts')}));
    builder.onResolve({filter:/^@\//},args=>builder.resolve('./'+args.path.slice(2),{resolveDir:root,kind:args.kind}));
    builder.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}));
  }}]});
  let patches=0, lost=0; const patchBodies=[];
  const server=createServer(async(req,res)=>{try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(ui.outputFiles[0].contents);}
    if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(`<div id="root"></div><script>window.fixture=${JSON.stringify({job,ownerScope})};const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const result=await originalFetch(...args);if(args[1]?.method==='PATCH'&&result.ok)throw new TypeError('synthetic lost response after commit');return result}</script><script src="/bundle.js"></script>`);}
    if(url.pathname!=='/api/work-jobs' && url.pathname!=='/api/sky/a2a-delegations'){res.writeHead(404);return res.end();}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks), headers=new Headers(req.headers); headers.set('origin',url.origin);
    const selected=url.pathname==='/api/work-jobs'?route:delegationRoute;
    const result=await selected[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));
    if(req.method==='PATCH'){patches++;patchBodies.push(JSON.parse(body.toString('utf8')));if(result.status===200)lost++;}
    res.writeHead(result.status,{'content-type':'application/json'});res.end(await result.text());
  }catch(error){t.diagnostic(`fixture relay failed: ${String(error)}`);res.writeHead(500);res.end('Fixture request failed');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base=`http://127.0.0.1:${server.address().port}`, profile=join(dir,'chrome');
  const child=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:'ignore'});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exit;}});
  let port;for(let i=0;i<150;i++){try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{} await new Promise(resolve=>setTimeout(resolve,100));}assert.ok(port);
  const openTab=async()=>{const tab=await(await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT'})).json();const socket=new WebSocket(tab.webSocketDebuggerUrl), pending=new Map();let seq=0;
    await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    socket.addEventListener('message',event=>{const item=JSON.parse(event.data);if(pending.has(item.id)){const {resolve,reject}=pending.get(item.id);pending.delete(item.id);if(item.error)reject(new Error(item.error.message));else resolve(item.result);}});
    const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evalJs=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text);return result.result.value;};
    t.after(()=>socket.close());return evalJs;};
  const [a,b]=await Promise.all([openTab(),openTab()]);
  const wait=async(fn,expr)=>{for(let i=0;i<120;i++){if(await fn(expr))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(`timeout ${expr}: ${await fn('document.body.innerText')}`);};
  for(const tab of [a,b]){await wait(tab,'!!document.querySelector("summary")');
    // Simulate only the unavailable headless persistent-storage grant; the
    // IndexedDB strict transaction and the two tab contexts remain real.
    if (!(await tab('navigator.storage.persisted()'))) await tab('Object.defineProperty(navigator.storage, "persisted", {value: async () => true, configurable: true})');
    assert.equal(await tab('navigator.storage.persisted()'),true);await tab('document.querySelector("summary").click()');await tab('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("miiから同じ仕事を確認")).click()');await wait(tab,'document.body.innerText.includes("確認済み")');await tab('document.querySelector("input[type=checkbox]").click()');}
  await Promise.all([a,b].map(tab=>tab('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("計画取消を依頼")).click()')));
  for(const tab of [a,b])await wait(tab,'document.body.innerText.includes("停止要求の結果は未確認")');
  assert.equal(patches,1);assert.equal(lost,1);
  t.diagnostic(`local PATCH arrivals: ${patches}; successful replies lost: ${lost}`);
  assert.ok(patchBodies.every(body=>body.jobId===job.id && body.revision===job.revision && body.command.id===patchBodies[0].command.id));
  const saved=await workStore(db).get(owner,job.id);assert.equal(saved.id,job.id);assert.equal(saved.status,'cancelled');
  assert.equal(saved.events.filter(event=>event.command?.action==='cancel').length,1);
  assert.equal((await a2aDelegationStore(db).getBudgetReservation(owner,id)).state,'held');
  assert.equal((await a2aDelegationStore(db).getBudget(owner,job.id)).reservedMinor,50);
  const journal=await a(`new Promise((resolve,reject)=>{const r=indexedDB.open('rockstaros-mii-cancel-journal-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('pending').objectStore('pending').getAll();q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}})`);
  assert.equal(journal.length,1);assert.equal(journal[0].jobId,job.id);assert.equal(journal[0].ownerScope,ownerScope);assert.equal(journal[0].commandId,patchBodies[0].command.id);
  const arrivalsBeforeReadback=patches;
  for(const tab of [a,b]){await tab('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("miiから同じ仕事を確認")).click()');await wait(tab,'document.body.innerText.includes("計画取消（実行先の停止は未確認）")');}
  assert.equal(patches,arrivalsBeforeReadback);
  assert.equal((await a2aDelegationStore(db).get(owner,id)).parentJobId,job.id);
  await a('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("委任予算を読み直す")).click()');
  await wait(a,'document.body.innerText.includes("取得時点の委任予算")');
  assert.ok(await a(`document.querySelector('[aria-label="miiから見た同じ仕事"]').textContent.includes('予約中 '+new Intl.NumberFormat('ja-JP',{style:'currency',currency:'USD'}).format(0.50))`));

  assert.equal((await store.get(owner,id)).state,'working');
  assert.equal((await store.requestCancel(owner,id)).state,'cancel_requested');
  async function reconcile() {
    const wf=await (await worker.getBindings()).A2A_DELEGATION_WORKFLOW.create({id:`reconcile-${randomUUID()}`,params:{ownerUserId:owner,delegationId:id,operation:'reconcile'}});
    let status;for(let i=0;i<200;i++){status=await wf.status();if(['complete','errored'].includes(status.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
    return status;
  }
  const lostRemote=await reconcile();assert.equal(lostRemote.status,'errored',JSON.stringify(lostRemote));
  assert.equal((await store.get(owner,id)).state,'cancel_unconfirmed');
  assert.equal((await store.getBudgetReservation(owner,id)).state,'held');
  let resumed=await reconcile();assert.equal(resumed.status,'complete',JSON.stringify(resumed));
  assert.deepEqual(resumed.output,{outcome:'task_reconciled',state:'remote_cancelled',usageOutcome:'rejected'});
  assert.equal((await store.getBudgetReservation(owner,id)).state,'held');assert.equal(await store.getUsageReceipt(owner,id),null);
  resumed=await reconcile();assert.equal(resumed.status,'complete',JSON.stringify(resumed));
  assert.deepEqual(resumed.output,{outcome:'task_reconciled',state:'remote_cancelled',usageOutcome:'settled'});
  const receipt=await store.getUsageReceipt(owner,id);assert.equal(receipt.providerReference,'vitest-lost-cancel-usage');
  assert.equal((await store.getBudget(owner,parent)).reservedMinor,0);assert.equal((await store.getBudget(owner,parent)).settledMinor,11);
  const replay=await store.settleUsageReceipt(owner,id,JSON.parse(receipt.receiptJson));assert.equal(replay.reservation.settledMinor,11);
  assert.equal((await store.getBudget(owner,parent)).settledMinor,11);
  resumed=await reconcile();assert.equal(resumed.status,'complete',JSON.stringify(resumed));assert.deepEqual(resumed.output,{outcome:'not_dispatchable'});
  assert.deepEqual(await workStore(db).get(owner,parent),saved);
  await a('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("委任予算を読み直す")).click()');
  await wait(a,`document.querySelector('[aria-label="miiから見た同じ仕事"]')?.textContent.includes('利用量確定記録 '+new Intl.NumberFormat('ja-JP',{style:'currency',currency:'USD'}).format(0.11))`);
  const counts=await db.prepare("SELECT event_type AS type,COUNT(*) AS n FROM agent_delegation_events WHERE owner_user_id=? AND delegation_id=? AND event_type IN ('remote_send_claimed','remote_cancel_claimed') GROUP BY event_type").bind(owner,id).all();
  assert.deepEqual(counts.results.sort((a,b)=>a.type.localeCompare(b.type)),[{type:'remote_cancel_claimed',n:1},{type:'remote_send_claimed',n:1}]);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM a2a_usage_receipts WHERE owner_user_id=? AND delegation_id=?').bind(owner,id).first()).n,1);
});
