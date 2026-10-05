// Loopback Worker/D1/R2 regression. Synthetic users, no payments or providers.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { removeCsvJobStorage, purgeExpiredCsvJobs, CSV_RETENTION_CRON } from '../lib/csv-retention.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'sky-csv-storage-'));
const alice = `csv-alice-${randomUUID()}`, bob = `csv-bob-${randomUUID()}`;
const content = 'id,name,note\r\n001, A ,=1+1\r\n001,A,duplicate\r\n002, B ,safe\r\n';
let worker, db, bucket, origin, assertions = 0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function check(actual, expected) { assert.deepEqual(actual, expected); assertions++; }
async function start() {
  const directory = join(temporary, 'dist/server');
  const config = JSON.parse(readFileSync(join(directory, 'wrangler.json'), 'utf8'));
  worker = new Miniflare(convertV4MiniflareOptions({
    name: config.name, rootPath: directory, modulesRoot: directory,
    modules: [config.main, ...readdirSync(directory, {recursive:true, encoding:'utf8'})
      .filter(f => f !== config.main && /\.m?js$/.test(f))]
      .map(f => ({type:'ESModule', path:resolve(directory, f)})),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: {...config.vars, SKY_REMOTE_LLM_ENABLED:'false'},
    d1Databases: {DB:'csv-regression-db'}, r2Buckets: {BUCKET:'csv-regression-files'},
    resourcePersistencePath: join(temporary, 'state'), host:'127.0.0.1', port:0,
  }));
  origin = (await worker.ready).origin;
  db = await worker.getD1Database('DB'); bucket = await worker.getR2Bucket('BUCKET');
}
async function stop() { await worker?.dispose(); worker = undefined; }
async function call(path, {method='GET', user=alice, body, status=200, requestOrigin=origin} = {}) {
  const headers = new Headers();
  if (user !== null) headers.set('oai-authenticated-user-id', user);
  if (method !== 'GET') headers.set('Origin', requestOrigin);
  if (body && !(body instanceof FormData)) { headers.set('Content-Type','application/json'); body = JSON.stringify(body); }
  const response = await fetch(origin + path, {method, headers, ...(body === undefined ? {} : {body}), redirect:'manual', signal:AbortSignal.timeout(10000)});
  check(response.status, status);
  return response;
}
async function create(id=randomUUID(), user=alice, text=content, status=201) {
  const form = new FormData(); form.set('id',id); form.set('sample','true');
  form.set('file', new File([text], 'synthetic.csv', {type:'text/csv'}));
  form.set('specification', JSON.stringify({trim:['name'], dedupe:{keys:['id'],mode:'first'}, spreadsheetSafe:true}));
  const response = await call('/api/csv-jobs', {method:'POST',user,body:form,status});
  return status===201 ? (await response.json()).job : null;
}
async function stored(id) { return db.prepare('SELECT * FROM csv_jobs WHERE id=?').bind(id).first(); }
async function inputHash(id) { const row=await stored(id); return hash(Buffer.from(await (await bucket.get(row.input_key)).arrayBuffer())); }
async function finish(job, user=alice) { return (await (await call('/api/csv-jobs/'+job.id, {method:'POST',user,body:{revision:job.revision}})).json()).job; }
async function artifacts(job, user=alice) {
  const result = {};
  for (const kind of job.artifacts) {
    const path=`/api/csv-jobs/${job.id}/artifact/${kind}`;
    const response=await call(path,{user});
    check(response.headers.get('cache-control'),'private, no-store');
    check(response.headers.get('x-content-type-options'),'nosniff');
    result[kind]=hash(Buffer.from(await response.arrayBuffer()));
    await call(path,{user:user===alice?bob:alice,status:404});
    await call(path,{user:null,status:401});
  }
  return result;
}
try {
  cpSync(join(root,'dist'),join(temporary,'dist'), {recursive:true,filter:p=>!p.split(/[\\/]/).at(-1).startsWith('._')});
  await start();
  // Canonical builds apply the append-only migration chain before admission.
  for (const file of readdirSync(join(root,'drizzle')).filter(f=>f.endsWith('.sql') && !f.startsWith('._')).sort())
    for (const sql of readFileSync(join(root,'drizzle',file),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))
      await db.prepare(sql).run();
  await call('/api/csv-jobs',{user:null,status:401});
  await call('/api/csv-jobs',{method:'POST',body:{},requestOrigin:'https://invalid.example',status:403});

  // Library saves are owner-scoped bookmarks, not execution consent or purchases.
  const library = async user => (await (await call('/api/sky/library', {user})).json());
  check(await library(alice), []); check(await library(bob), []);
  await call('/api/sky/library', {user:null,status:401});
  await call('/api/sky/library', {method:'PUT',user:null,body:{tool:'mr-citations',saved:true},status:401});
  await call('/api/sky/library', {method:'PUT',body:{tool:'mr-citations',saved:true},requestOrigin:'https://invalid.example',status:403});
  for (const body of [{tool:'unknown',saved:true},{tool:'mr-citations',saved:'true'},{tool:'mr-citations',saved:true,grant:true}])
    await call('/api/sky/library', {method:'PUT',body,status:400});
  for (let i=0;i<2;i++) check(await (await call('/api/sky/library', {method:'PUT',body:{tool:'mr-citations',saved:true}})).json(), {tool:'mr-citations',saved:true});
  const saved = await library(alice); check(saved.length,1); check(saved[0].tool,'mr-citations'); check(await library(bob),[]);
  await call('/api/sky/library', {method:'PUT',user:bob,body:{tool:'mr-citations',saved:false}});
  check((await library(alice)).length,1);
  await call('/api/sky/library', {method:'PUT',user:bob,body:{tool:'mr-citations',saved:true}});
  check((await library(bob)).map(item=>item.tool),['mr-citations']); check((await library(alice)).length,1);
  await call('/api/sky/library', {method:'PUT',user:bob,body:{tool:'mr-citations',saved:false}});
  check(await (await call('/api/sky/connections')).json(),[]);
  check(await (await call('/api/jobs')).json(),[]);
  check((await db.prepare('SELECT COUNT(*) AS count FROM devices').first()).count,0);
  for (let i=0;i<2;i++) await call('/api/sky/library', {method:'PUT',body:{tool:'mr-citations',saved:false}});
  check(await library(alice),[]);

  for (const tool of ['rockstar-csv-cleanup','coconala']) {
    check(await (await call('/api/sky/library',{method:'PUT',body:{tool,saved:true}})).json(),{tool,saved:true});
    check((await library(alice)).map(item=>item.tool),[tool]);
    check(await library(bob),[]);
    check((await db.prepare('SELECT COUNT(*) AS count FROM devices').first()).count,0);
    check(await (await call('/api/jobs')).json(),[]);
    check(await (await call('/api/csv-jobs')).json().then(value=>value.jobs),[]);
    await call('/api/sky/library',{method:'PUT',body:{tool,saved:false}});
  }

  let first = await create(); const originalHash=await inputHash(first.id);
  check(first.quoteMinor,0);check(await create(first.id),first);
  await create(first.id,bob,content,409);check(await inputHash(first.id),originalHash);
  check((await bucket.list({prefix:`csv/${first.id}/`})).objects.length,1);
  await create(first.id,alice,content.replace('safe','changed'),409);check(await inputHash(first.id),originalHash);
  // Same-owner concurrent replay converges on one record and one input object.
  const replayId=randomUUID();
  const replays=await Promise.all([create(replayId),create(replayId)]);
  check(replays[0],replays[1]);check(await inputHash(replayId),hash(Buffer.from(content)));
  check((await bucket.list({prefix:`csv/${replayId}/`})).objects.length,1);
  // Different-owner concurrent requests may create only the winning owner's object.
  const collisionId=randomUUID(), otherContent=content.replace('safe','other-owner');
  const upload=(user,text)=>{const form=new FormData();form.set('id',collisionId);form.set('sample','true');form.set('file',new File([text],'race.csv'));return fetch(origin+'/api/csv-jobs',{method:'POST',headers:{Origin:origin,'oai-authenticated-user-id':user},body:form,signal:AbortSignal.timeout(10000)});};
  const race=await Promise.all([upload(alice,content),upload(bob,otherContent)]);
  check(race.map(r=>r.status).sort((a,b)=>a-b),[201,409]);
  const winner=await stored(collisionId);
  check(await inputHash(collisionId),hash(Buffer.from(winner.user_id===alice?content:otherContent)));
  check((await bucket.list({prefix:`csv/${collisionId}/`})).objects.length,1);
  first=await finish(first);check(first.status,'completed');check(first.validation.passed,true);
  const before=await artifacts(first);check(Object.keys(before).length,4);
  await call('/api/sky/library',{method:'PUT',body:{tool:'mr-citations',saved:true}});
  await stop();await start();check(await artifacts(first),before);
  check((await library(alice)).map(item=>item.tool),['mr-citations']); check(await library(bob),[]);
  await call('/api/csv-jobs/'+first.id,{method:'DELETE',user:bob,status:404});
  check(await artifacts(first),before);
  await call('/api/csv-jobs/'+first.id,{method:'DELETE',status:204});
  check(await stored(first.id),null);check((await bucket.list({prefix:`csv/${first.id}/`})).objects.length,0);
  await call(`/api/csv-jobs/${first.id}/artifact/result`,{status:404});
  const expired=await finish(await create());
  await db.prepare('UPDATE csv_jobs SET expires_at=? WHERE id=?').bind(Date.now()-1,expired.id).run();
  await call(`/api/csv-jobs/${expired.id}/artifact/result`,{status:410});
  check(await stored(expired.id),null);check((await bucket.list({prefix:`csv/${expired.id}/`})).objects.length,0);
  async function failedInputJob() {
    const quoted=await create(), row=await stored(quoted.id);
    const object=await bucket.get(row.input_key), bytes=new Uint8Array(await object.arrayBuffer());
    await bucket.delete(row.input_key);
    await call('/api/csv-jobs/'+quoted.id,{method:'POST',body:{revision:quoted.revision},status:500});
    const failed=await stored(quoted.id);check(failed.status,'quality_failed');check(failed.attempt,1);
    await bucket.put(row.input_key,bytes,{httpMetadata:{contentType:'text/csv'},customMetadata:object.customMetadata});
    return failed;
  }
  const retryable=await failedInputJob();
  const recovered=(await (await call('/api/csv-jobs/'+retryable.id,{method:'POST',body:{action:'retry',revision:retryable.revision}})).json()).job;
  check(recovered.status,'completed');check(recovered.attempt,2);check(recovered.validation.passed,true);
  const expiredFailure=await failedInputJob();
  await db.prepare('UPDATE csv_jobs SET expires_at=? WHERE id=?').bind(Date.now()-1,expiredFailure.id).run();
  const retryBody={action:'retry',revision:expiredFailure.revision};
  await call('/api/csv-jobs/'+expiredFailure.id,{method:'POST',user:null,body:retryBody,status:401});
  await call('/api/csv-jobs/'+expiredFailure.id,{method:'POST',user:bob,body:retryBody,status:404});
  check((await stored(expiredFailure.id)).attempt,1);
  await call('/api/csv-jobs/'+expiredFailure.id,{method:'POST',body:retryBody,status:410});
  check(await stored(expiredFailure.id),null);check((await bucket.list({prefix:`csv/${expiredFailure.id}/`})).objects.length,0);
  // Retention uses the same compiled Worker, with only synthetic local storage.
  const retentionUser=`csv-retention-${randomUUID()}`;
  const live=await finish(await create(randomUUID(),retentionUser),retentionUser);
  const liveArtifacts=await artifacts(live,retentionUser);
  async function expiredClone(user=retentionUser, status='quoted') {
    const id=randomUUID(), inputKey=`csv/${id}/input-${randomUUID()}.csv`, now=Date.now();
    await bucket.put(inputKey,content);
    await db.prepare("INSERT INTO csv_jobs (id,user_id,status,payment_status,input_name,input_key,input_bytes,input_sha256,input_encoding,specification_json,quote_minor,currency,attempt,revision,expires_at,created_at,updated_at) SELECT ?,?,?,payment_status,input_name,?,input_bytes,input_sha256,input_encoding,specification_json,quote_minor,currency,0,0,?,?,? FROM csv_jobs WHERE id=?")
      .bind(id,user,status,inputKey,now-1000,now-2000,now-2000,live.id).run();
    return stored(id);
  }
  const batch=[];
  for(let i=0;i<21;i++) batch.push(await expiredClone());
  const foreignExpired=await expiredClone(bob), processing=await expiredClone(retentionUser,'processing');
  await bucket.put(`csv/${batch[0].id}/result.csv`,'partial unrecorded result');
  const ledgerId=`retention-payment-${randomUUID()}`;
  await db.prepare('INSERT INTO csv_trial_payments(id,job_id,mode,session_id,created_at) VALUES(?,?,?,?,?)').bind(ledgerId,batch[20].id,'test','synthetic-retention-session',Date.now()).run();
  await call('/api/csv-jobs/'+processing.id,{method:'DELETE',user:retentionUser,status:409});
  check((await bucket.list({prefix:`csv/${processing.id}/`})).objects.length,1);
  const listed=(await (await call('/api/csv-jobs',{user:retentionUser})).json()).jobs;
  check(listed.map(j=>j.id),[live.id]);
  check((await db.prepare("SELECT count(*) AS count FROM csv_jobs WHERE user_id=? AND expires_at<=? AND status<>'processing'").bind(retentionUser,Date.now()).first()).count,1);
  check((await bucket.list({prefix:`csv/${batch[0].id}/`})).objects.length,0);
  check(Boolean(await stored(foreignExpired.id)),true);
  check((await (await worker.getWorker()).scheduled({cron:'unrelated-cron'})).outcome,'ok');
  check(Boolean(await stored(foreignExpired.id)),true);
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'ok');
  for(const row of [...batch,foreignExpired]) {check(await stored(row.id),null);check((await bucket.list({prefix:`csv/${row.id}/`})).objects.length,0);}
  check(Boolean(await stored(processing.id)),true);check(await artifacts(live,retentionUser),liveArtifacts);
  check((await db.prepare('SELECT session_id FROM csv_trial_payments WHERE id=?').bind(ledgerId).first()).session_id,'synthetic-retention-session');

  // Transactional DB deletion fails after R2 cleanup: events/row must survive.
  const dbFailure=await expiredClone();
  await db.prepare('INSERT INTO csv_job_events(job_id,user_id,event,detail_json,created_at) VALUES(?,?,?,?,?)').bind(dbFailure.id,retentionUser,'synthetic_cleanup','{}',Date.now()).run();
  await db.prepare(`CREATE TRIGGER synthetic_cleanup_abort BEFORE DELETE ON csv_jobs WHEN OLD.id='${dbFailure.id}' BEGIN SELECT RAISE(ABORT,'synthetic retention DB failure'); END`).run();
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'exception');
  check((await stored(dbFailure.id)).status,'cleanup_pending');
  check((await db.prepare('SELECT count(*) AS count FROM csv_job_events WHERE job_id=?').bind(dbFailure.id).first()).count,1);
  check((await bucket.list({prefix:`csv/${dbFailure.id}/`})).objects.length,0);
  check((await (await call('/api/csv-jobs',{user:retentionUser})).json()).jobs.map(j=>j.id),[live.id]);
  await db.prepare('DROP TRIGGER synthetic_cleanup_abort').run();
  await stop();await start();
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'ok');
  check(await stored(dbFailure.id),null);
  check((await db.prepare('SELECT count(*) AS count FROM csv_job_events WHERE job_id=?').bind(dbFailure.id).first()).count,0);

  // R2 fault injection is component-level on real local D1/R2, not a provider proof.
  const r2Failure=await expiredClone();
  await bucket.put(`csv/${r2Failure.id}/result.csv`,'partial unrecorded result');
  await assert.rejects(removeCsvJobStorage(db,{delete:async keys=>{await bucket.delete(keys.slice(0,1));throw new Error('synthetic partial R2 failure');}},r2Failure,{expiredOnly:true})); assertions++;
  check((await stored(r2Failure.id)).status,'cleanup_pending');
  check((await bucket.list({prefix:`csv/${r2Failure.id}/`})).objects.length,1);
  await stop();await start();
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'ok');
  check(await stored(r2Failure.id),null);check((await bucket.list({prefix:`csv/${r2Failure.id}/`})).objects.length,0);

  // Corrupt cross-job keys are quarantined; a bad row cannot block other work.
  const invalid=await expiredClone(), valid=await expiredClone();
  const protectedRow=await stored(live.id);
  await db.prepare('UPDATE csv_jobs SET input_key=? WHERE id=?').bind(protectedRow.result_key,invalid.id).run();
  await db.prepare('UPDATE csv_jobs SET updated_at=0 WHERE id=?').bind(invalid.id).run();
  check(await purgeExpiredCsvJobs(db,bucket,{limit:1}),{scanned:1,deleted:0,failed:1,changed:0});
  check(await purgeExpiredCsvJobs(db,bucket,{limit:1}),{scanned:1,deleted:1,failed:0,changed:0});
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'exception');
  check((await stored(invalid.id)).status,'quoted'); check(await stored(valid.id),null);
  check(await artifacts(live,retentionUser),liveArtifacts);
  await db.prepare('UPDATE csv_jobs SET input_key=? WHERE id=?').bind(invalid.input_key,invalid.id).run();
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'ok');
  check(await stored(invalid.id),null);check((await bucket.list({prefix:`csv/${invalid.id}/`})).objects.length,0);
  check((await (await worker.getWorker()).scheduled({cron:CSV_RETENTION_CRON})).outcome,'ok');
  check(Boolean(await stored(processing.id)),true);
  // A delayed deletion from an earlier incarnation must not touch recreated
  // input/results, even when the client reuses the ID and revision numbers.
  const oldJob=await finish(await create(randomUUID(),retentionUser),retentionUser);
  const oldRow=await stored(oldJob.id);
  let signalEntered, releaseDeletion;
  const entered=new Promise(resolve=>{signalEntered=resolve;});
  const delayed=new Promise(resolve=>{releaseDeletion=resolve;});
  const oldDeletion=removeCsvJobStorage(db,{delete:async keys=>{signalEntered();await delayed;await bucket.delete(keys);}},oldRow);
  await entered;
  check(await removeCsvJobStorage(db,bucket,await stored(oldJob.id)),'deleted');
  const recreated=await finish(await create(oldJob.id,retentionUser),retentionUser);
  const recreatedRow=await stored(recreated.id), recreatedArtifacts=await artifacts(recreated,retentionUser);
  check(recreatedRow.input_key===oldRow.input_key,false);
  check(recreatedRow.result_key===oldRow.result_key,false);
  releaseDeletion();check(await oldDeletion,'changed');
  check(await stored(recreated.id),recreatedRow);
  check(await artifacts(recreated,retentionUser),recreatedArtifacts);
  // Stale snapshots cannot claim a new incarnation with a matching revision.
  check(await removeCsvJobStorage(db,{delete:async()=>assert.fail('stale incarnation must not delete')},{...oldRow,revision:recreatedRow.revision}),'changed');

  // Exact ABA: both old/new deletion claims have revision 1. The old DB
  // finalization must preserve the new pending row and its events as well.
  const aba=await create(randomUUID(),retentionUser), abaRow=await stored(aba.id);
  let enterOld, releaseOld;
  const oldEntered=new Promise(resolve=>{enterOld=resolve;}), oldWait=new Promise(resolve=>{releaseOld=resolve;});
  const pendingOld=removeCsvJobStorage(db,{delete:async keys=>{enterOld();await oldWait;await bucket.delete(keys);}},abaRow);
  await oldEntered;
  check(await removeCsvJobStorage(db,bucket,await stored(aba.id)),'deleted');
  await create(aba.id,retentionUser);
  let enterNew, releaseNew;
  const newEntered=new Promise(resolve=>{enterNew=resolve;}), newWait=new Promise(resolve=>{releaseNew=resolve;});
  const pendingNew=removeCsvJobStorage(db,{delete:async keys=>{enterNew();await newWait;await bucket.delete(keys);}},await stored(aba.id));
  await newEntered;
  const newPending=await stored(aba.id);
  check(newPending.revision,abaRow.revision+1);
  releaseOld();check(await pendingOld,'changed');
  check(await stored(aba.id),newPending);
  check((await db.prepare('SELECT count(*) AS count FROM csv_job_events WHERE job_id=?').bind(aba.id).first()).count,1);
  check(Boolean(await bucket.get(newPending.input_key)),true);
  releaseNew();check(await pendingNew,'deleted');check(await stored(aba.id),null);
  console.log(`CSV Worker/D1/R2 regression passed (${assertions} assertions; synthetic only).`);
} finally { await stop(); rmSync(temporary,{recursive:true,force:true}); }
