// Loopback Worker/D1/R2 regression. Synthetic users, no payments or providers.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

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
  // Canonical builds use migrations; Sites builds also have an idempotent bootstrap.
  for (const file of readdirSync(join(root,'drizzle')).filter(f=>f.endsWith('.sql')).sort())
    for (const sql of readFileSync(join(root,'drizzle',file),'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))
      await db.prepare(sql).run();
  await db.prepare('CREATE TABLE IF NOT EXISTS sky_service_schema(version INTEGER PRIMARY KEY)').run();
  await call('/api/csv-jobs',{user:null,status:401});
  await call('/api/csv-jobs',{method:'POST',body:{},requestOrigin:'https://invalid.example',status:403});
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
  await stop();await start();check(await artifacts(first),before);
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
  console.log(`CSV Worker/D1/R2 regression passed (${assertions} assertions; synthetic only).`);
} finally { await stop(); rmSync(temporary,{recursive:true,force:true}); }
