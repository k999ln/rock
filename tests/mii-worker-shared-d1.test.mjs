import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { build } from 'esbuild';
import { createWorkJob } from '../lib/workflow.ts';
import { workStore } from '../lib/work-store.ts';
import { a2aDelegationStore } from '../lib/a2a-delegation-store.ts';
import { encryptA2AInput } from '../lib/a2a-input-crypto.ts';

const chrome = process.env.ROCK_TEST_CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
async function delegationTable(db) {
  const directory = new URL('../drizzle-legacy/post-site-bridge/', import.meta.url);
  const migrations = readdirSync(directory).filter(name => /^(0019|0020|0021|0022|0025|0033|0041|0056|0057)_.*\.sql$/.test(name)).sort();
  for (const name of migrations) for (const statement of readFileSync(new URL(name, directory), 'utf8').split('--> statement-breakpoint')) {
    if ((name.startsWith('0019') || name.startsWith('0020') || name.startsWith('0021') || name.startsWith('0025')) && statement.trim()) await db.prepare(statement.trim()).run();
    else if (/^\s*ALTER TABLE [`"]?agent_delegations[`"]?/i.test(statement)) await db.prepare(statement.trim()).run();
  }
}
async function prepareUnapproved(db, owner, job, approve = false) {
  const id = randomUUID(), message = '合成依頼', inputSha256 = createHash('sha256').update(message).digest('hex');
  const store = a2aDelegationStore(db), result = await store.prepare(owner, {
    id, parentJobId: job.id, idempotencyKey: `shared-${id}`, messageId: randomUUID(),
    targetOrigin: 'https://agent.example.test', targetAgentName: 'Synthetic agent', targetAgentVersion: '1',
    protocolVersion: '1.0', inputSha256, authorizationSha256: 'b'.repeat(64),
    budgetCurrency: 'USD', budgetLimitMinor: 5, parentBudgetLimitMinor: 10,
    continueWhileDeviceOffline: true, deadlineAt: Date.now() + 60000,
  });
  assert.equal(result.created, true); assert.equal(result.delegation.parentJobId, job.id);
  assert.equal(result.delegation.state, 'awaiting_approval');
  if (approve) {
    // Explicit synthetic owner approval reserves budget only; it is not a
    // signed broker authority and does not authorize dispatch.
    const encrypted = await encryptA2AInput(message, 'b'.repeat(64), owner, id, inputSha256);
    assert.equal((await store.approve(owner,id,'b'.repeat(64),encrypted)).state,'prepared');
    assert.equal((await store.getBudgetReservation(owner,id)).state,'held');
  }
  return id;
}
void test('isolated browser and actual A2A Workflow share one workerd D1', { timeout: 30000, skip: !chrome && 'Chrome unavailable' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'mii-worker-shared-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const bundled = await build({ entryPoints: ['tests/fixtures/mii-worker-shared/workflow-wrapper.mjs'], bundle: true,
    write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*'], logLevel: 'silent' });
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0,
    compatibilityDate: '2026-08-18', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    workflows: { A2A_DELEGATION_WORKFLOW: { name: 'mii-shared-browser', className: 'A2ADelegationWorkflow' } },
    script: bundled.outputFiles[0].text }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  await db.prepare('CREATE TABLE work_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)').run();
  await delegationTable(db);
  const owner = 'synthetic-shared-owner', job = createWorkJob({ id: randomUUID(), title: '共有試験', templateId: 'article' });
  await workStore(db).create(owner, job);
  const delegationId = await prepareUnapproved(db, owner, job);
  const server = createServer(async (req,res) => {
    try {
      if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<body>waiting<script>fetch("/job").then(r=>r.json()).then(v=>document.body.textContent=JSON.stringify(v))</script></body>'); }
      if (req.url !== '/job') { res.writeHead(404); return res.end(); }
      const response = await worker.dispatchFetch(`http://fixture.invalid/job?owner=${encodeURIComponent(owner)}&id=${job.id}`);
      res.writeHead(response.status, { 'content-type': 'application/json' }); return res.end(await response.text());
    } catch (error) { res.writeHead(500); return res.end(String(error)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const child = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--disable-background-networking',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', `--user-data-dir=${join(dir, 'chrome')}`,
    '--virtual-time-budget=5000', '--dump-dom', base], { stdio: ['ignore','pipe','ignore'] });
  let output=''; child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve,reject) => { child.once('error',reject); child.once('close',resolve); });
  assert.equal(code,0); assert.match(output,new RegExp(job.id)); assert.match(output,new RegExp(owner));
  const bindings = await worker.getBindings();
  const instance = await bindings.A2A_DELEGATION_WORKFLOW.create({ id: `browser-${randomUUID()}`,
    params: { ownerUserId: owner, delegationId, operation: 'reconcile' } });
  let state;
  for (let i=0;i<100;i++) { state=await instance.status(); if (['complete','errored'].includes(state.status)) break; await new Promise(resolve => setTimeout(resolve,50)); }
  assert.equal(state.status, 'complete', JSON.stringify(state)); assert.deepEqual(state.output, { outcome: 'no_remote_task' });
  assert.equal((await a2aDelegationStore(db).get(owner, delegationId)).parentJobId, job.id);
  assert.deepEqual(await workStore(db).get(owner,job.id),job);
});

void test('actual A2A Workflow and browser-facing worker use the same D1 binding', { timeout: 30000 }, async t => {
  const bundled = await build({ entryPoints: ['tests/fixtures/mii-worker-shared/workflow-wrapper.mjs'], bundle: true,
    write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*'], logLevel: 'silent' });
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, host: '127.0.0.1', port: 0,
    compatibilityDate: '2026-08-18', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'],
    workflows: { A2A_DELEGATION_WORKFLOW: { name: 'mii-shared-fixture', className: 'A2ADelegationWorkflow' } },
    script: bundled.outputFiles[0].text }));
  t.after(() => worker.dispose());
  const db = await worker.getD1Database('DB');
  await db.prepare('CREATE TABLE work_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)').run();
  await delegationTable(db);
  const owner = 'synthetic-shared-owner', job = createWorkJob({ id: randomUUID(), title: 'Workflow shared job', templateId: 'article' });
  await workStore(db).create(owner, job);
  const delegationId = await prepareUnapproved(db, owner, job);
  const response = await worker.dispatchFetch(`http://fixture.invalid/job?owner=${encodeURIComponent(owner)}&id=${job.id}`);
  assert.equal(response.status, 200); const read = await response.json();
  assert.equal(read.owner, owner); assert.equal(read.job.id, job.id); assert.equal(read.revision, job.revision);
  const bindings = await worker.getBindings();
  const instance = await bindings.A2A_DELEGATION_WORKFLOW.create({ id: `shared-${randomUUID()}`,
    params: { ownerUserId: owner, delegationId, operation: 'reconcile' } });
  let state;
  for (let i=0;i<100;i++) { state=await instance.status(); if (['complete','errored'].includes(state.status)) break; await new Promise(resolve => setTimeout(resolve,50)); }
  assert.equal(state.status, 'complete', JSON.stringify(state));
  assert.deepEqual(state.output, { outcome: 'no_remote_task' });
  assert.deepEqual(await workStore(db).get(owner,job.id),job);
});

for (const disconnect of [false, true]) void test(`two real mii tabs race one local stop with ${disconnect ? 'transport disconnect' : 'consumer response loss'}`, { timeout: 45000, skip: !chrome && 'Chrome unavailable' }, async t => {
  const { loadRouteFixture } = await import('./route-fixture.mjs');
  const { ownerScopeFor } = await import('../lib/owner-intent.ts');
  const { readFile } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'mii-worker-two-tabs-')); t.after(() => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }));
  const root = new URL('..', import.meta.url).pathname;
  const bundled = await build({ entryPoints: ['tests/fixtures/mii-worker-shared/workflow-wrapper.mjs'], bundle: true,
    write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*'], logLevel: 'silent' });
  const worker = new Miniflare(convertV4MiniflareOptions({ modules: true, host:'127.0.0.1', port:0, compatibilityDate:'2026-08-18',
    compatibilityFlags:['nodejs_compat'], d1Databases:['DB'], workflows:{A2A_DELEGATION_WORKFLOW:{name:'two-tabs-fixture',className:'A2ADelegationWorkflow'}}, script:bundled.outputFiles[0].text }));
  t.after(() => worker.dispose()); const db = await worker.getD1Database('DB');
  await db.prepare('CREATE TABLE work_jobs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, payload TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)').run();
  await delegationTable(db);
  const owner='synthetic-shared-owner', ownerScope=await ownerScopeFor(owner);
  const job=createWorkJob({id:randomUUID(),title:'二tab同じ仕事',templateId:'article'});
  job.agentBinding={schema:'rockstaros.work-agent-binding/1',agentId:'fixture-role',agentRevision:1,requestDigest:'a'.repeat(64)};
  await workStore(db).create(owner,job); const delegationId=await prepareUnapproved(db,owner,job,true);
  const env={}; const deps=new Map([['cloudflare:workers',{env}],['@/lib/fund-store',{database:()=>db,requestUser:async()=>owner}]]);
  for (const name of ['bounded-stream','owner-intent','a2a-delegation-store','work-store','sky-agent-library-store','rockstar-service-access','workflow']) deps.set(`@/lib/${name}`,await import(new URL(`../lib/${name}.ts`,import.meta.url)));
  const route=loadRouteFixture(new URL('../app/api/work-jobs/route.ts',import.meta.url),deps);
  const ui=await build({entryPoints:['tests/fixtures/mii-worker-shared/mii-ui.tsx'],bundle:true,write:false,platform:'browser',jsx:'automatic',logLevel:'silent',plugins:[{name:'aliases',setup(builder){
    builder.onResolve({filter:/^@\/lib\/mii-preview-descriptors$/},()=>({path:join(root,'tests/fixtures/eve-smith-mii-browser/mii-preview-descriptors.ts')}));
    builder.onResolve({filter:/^@\//},args=>builder.resolve('./'+args.path.slice(2),{resolveDir:root,kind:args.kind}));
    builder.onLoad({filter:/\.css$/},()=>({contents:'export default {}',loader:'js'}));
  }}]});
  let patches=0, lost=0; const patchBodies=[];
  const server=createServer(async(req,res)=>{try {
    const url=new URL(req.url,`http://${req.headers.host}`);
    if(url.pathname==='/bundle.js'){res.writeHead(200,{'content-type':'application/javascript'});return res.end(ui.outputFiles[0].contents);}
    if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});return res.end(`<div id="root"></div><script>window.fixture=${JSON.stringify({job,ownerScope})};const originalFetch=window.fetch.bind(window);window.fetch=async(...args)=>{const result=await originalFetch(...args);if(!${disconnect}&&args[1]?.method==='PATCH'&&result.ok)throw new TypeError('synthetic lost response after commit');return result}</script><script src="/bundle.js"></script>`);}
    if(url.pathname!=='/api/work-jobs'){res.writeHead(404);return res.end();}
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks), headers=new Headers(req.headers); headers.set('origin',url.origin);
    const result=await route[req.method](new Request(url,{method:req.method,headers,...(body.length?{body}: {})}));
    if(req.method==='PATCH'){patches++;patchBodies.push(JSON.parse(body.toString('utf8')));if(result.status===200){lost++;if(disconnect){res.destroy();return;}}}
    res.writeHead(result.status,{'content-type':'application/json'});res.end(await result.text());
  }catch(error){res.writeHead(500);res.end(String(error));}});
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
  if(disconnect){assert.ok(patches>=1);assert.equal(lost,patches);}
  else {assert.equal(patches,1);assert.equal(lost,1);}
  t.diagnostic(`local PATCH arrivals: ${patches}; successful replies lost: ${lost}`);
  assert.ok(patchBodies.every(body=>body.jobId===job.id && body.revision===job.revision && body.command.id===patchBodies[0].command.id));
  const saved=await workStore(db).get(owner,job.id);assert.equal(saved.id,job.id);assert.equal(saved.status,'cancelled');
  assert.equal(saved.events.filter(event=>event.command?.action==='cancel').length,1);
  assert.equal((await a2aDelegationStore(db).getBudgetReservation(owner,delegationId)).state,'held');
  assert.equal((await a2aDelegationStore(db).getBudget(owner,job.id)).reservedMinor,5);
  if(disconnect){
    // Deliberate test-only replay of the exact command, independent of any
    // browser transport retries. The real route must remain idempotent.
    const replay=await route.PATCH(new Request(`${base}/api/work-jobs`,{method:'PATCH',
      headers:{Origin:base,'Content-Type':'application/json','X-Rock-Owner-Scope':ownerScope},body:JSON.stringify(patchBodies[0])}));
    assert.equal(replay.status,200);assert.deepEqual((await replay.json()).job,saved);
    const afterReplay=await workStore(db).get(owner,job.id);assert.deepEqual(afterReplay,saved);
    assert.equal(afterReplay.events.filter(event=>event.command?.action==='cancel').length,1);
    assert.equal((await a2aDelegationStore(db).getBudgetReservation(owner,delegationId)).state,'held');
    assert.equal((await a2aDelegationStore(db).getBudget(owner,job.id)).reservedMinor,5);
  }
  const journal=await a(`new Promise((resolve,reject)=>{const r=indexedDB.open('rockstaros-mii-cancel-journal-v1');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result;const q=db.transaction('pending').objectStore('pending').getAll();q.onsuccess=()=>{db.close();resolve(q.result)};q.onerror=()=>reject(q.error)}})`);
  assert.equal(journal.length,1);assert.equal(journal[0].jobId,job.id);assert.equal(journal[0].ownerScope,ownerScope);assert.equal(journal[0].commandId,patchBodies[0].command.id);
  const arrivalsBeforeReadback=patches;
  for(const tab of [a,b]){await tab('[...document.querySelectorAll("button")].find(e=>e.textContent.includes("miiから同じ仕事を確認")).click()');await wait(tab,'document.body.innerText.includes("計画取消（実行先の停止は未確認）")');}
  assert.equal(patches,arrivalsBeforeReadback);
  assert.equal((await a2aDelegationStore(db).get(owner,delegationId)).parentJobId,job.id);
  const workflow=await (await worker.getBindings()).A2A_DELEGATION_WORKFLOW.create({id:`two-tabs-${randomUUID()}`,params:{ownerUserId:owner,delegationId,operation:'reconcile'}});
  let state;for(let i=0;i<100;i++){state=await workflow.status();if(['complete','errored'].includes(state.status))break;await new Promise(resolve=>setTimeout(resolve,50));}
  assert.equal(state.status,'complete',JSON.stringify(state));assert.deepEqual(state.output,{outcome:'no_remote_task'});
  assert.equal((await a2aDelegationStore(db).getBudgetReservation(owner,delegationId)).state,'held');
  const claims=await db.prepare("SELECT COUNT(*) AS n FROM agent_delegation_events WHERE delegation_id=? AND owner_user_id=? AND event_type IN ('remote_send_claimed','remote_cancel_claimed')").bind(delegationId,owner).first();
  assert.equal(claims.n,0);
});
