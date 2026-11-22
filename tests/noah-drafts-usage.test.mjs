import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createNoahDraftApi } from '../lib/noah-drafts.ts';
import { reportNoahAgentUsage } from '../toolkits/noah-agent-client/usage.mjs';
import { parseSkyToolEvent, skyToolEventStore } from '../lib/sky-tool-events.ts';
import { noahUsageReport } from '../lib/noah-usage.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { noahAgentTemplate } from '../lib/noah-agent-upload.ts';
import { workStore } from '../lib/work-store.ts';
import { createNoahWork, executionInputDigest } from '../lib/noah-execution.ts';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:'); t.after(() => sqlite.close());
  for (const file of ['0021_sites_schema_convergence.sql','0033_noah_agent_uploads.sql','0034_noah_upload_refactor.sql','0035_noah_agent_drafts.sql','0037_noah_agent_invites.sql','0039_noah_invite_execution.sql','0040_noah_draft_storage.sql']) sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  const db = { prepare(sql) { return { bind(...args) { return {
    async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
    async first() { return sqlite.prepare(sql).get(...args) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...args) }; },
  }; } }; } };
  const blobs = new Map();
  const api = createNoahDraftApi({ db, authenticate: async request => { const owner = request.headers.get('test-owner'); if (!owner) throw new Error('UNAUTHORIZED'); return owner; },
    bucket: { async put(key, data) { blobs.set(key, data); }, async get(key) { return blobs.has(key) ? { body: blobs.get(key) } : null; } } });
  return { db, sqlite, api, blobs };
}
const value = () => ({ revision: 0, commandId: randomUUID(), clearSource: false,
  content: { manifest: { ...noahAgentTemplate, name: '', endpointUrl: '', summary: '' }, codeMode: 'paste', codeName: 'agent.py', code: 'print(123)\n', rights: true } });
void test('Noah history filters before the limit, without leaking other owners or losing older Agent work', async t => {
  const { db, sqlite } = fixture(t), agentId = 'research-ce4e58553bea6313acf7', prompt = 'synthetic task';
  const job = await createNoahWork(randomUUID(), { agentId, recipe: 'aider', version: '0.86.2', image: `sha256:${'d'.repeat(64)}`, model: 'qwen3:4b', prompt, inputSha256: await executionInputDigest(agentId, prompt), claimSha256: 'b'.repeat(64) });
  const insert = sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)');
  insert.run(job.id, 'alice', JSON.stringify(job), 1, '2020-01-01');
  insert.run(randomUUID(), 'bob', JSON.stringify(job), 1, '2030-01-01');
  for (let i = 0; i < 105; i++) insert.run(randomUUID(), 'alice', '{}', 1, '2030-01-01');
  assert.deepEqual((await workStore(db).listNoah('alice')).map(j => j.id), [job.id]);
  assert.equal((await workStore(db).listNoah('alice', 'different-agent')).length, 0);
  assert.equal((await workStore(db).listNoah('alice', agentId)).length, 1);
});
async function request(method = 'GET', data, owner = 'alice', override = {}) {
  return new Request('https://noah.example/api/noah/drafts', { method, headers: { 'test-owner': owner, origin: 'https://noah.example', 'X-Rock-Owner-Scope': await ownerScopeFor(owner), ...(data && !(data instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...override }, ...(data ? { body: data instanceof FormData ? data : JSON.stringify(data) } : {}) });
}
void test('draft accepts incomplete definition, survives API reconstruction, retries exactly and fences old tabs', async t => {
  const { api, sqlite } = fixture(t), id = randomUUID(), payload = value();
  assert.equal((await api.put(await request('PUT', payload), id)).status, 201);
  const first = await (await api.get(await request(), id)).json();
  assert.equal(first.draft.revision, 1); assert.equal(first.draft.content.manifest.endpointUrl, '');
  assert.equal((await api.put(await request('PUT', payload), id)).status, 200);
  assert.equal((await api.put(await request('PUT', { ...payload, content: { ...payload.content, code: 'changed' } }), id)).status, 409);
  const change = { ...payload, revision: 1, commandId: randomUUID(), content: { ...payload.content, code: 'print(456)' } };
  assert.equal((await api.put(await request('PUT', change), id)).status, 200);
  assert.equal((await api.put(await request('PUT', { ...change, commandId: randomUUID() }), id)).status, 409);
  assert.equal(JSON.parse(sqlite.prepare('SELECT content FROM noah_agent_drafts WHERE id=?').get(id).content).code, 'print(456)');
});
void test('draft read/write/download/delete and Origin are owner isolated, deletion fences resurrection', async t => {
  const { api, blobs } = fixture(t), id = randomUUID(), payload = value();
  const form = new FormData(); form.set('draft', JSON.stringify(payload)); form.set('source', new File(['print(123)'], 'main.py'));
  assert.equal((await api.put(await request('PUT', form), id)).status, 201);
  assert.equal((await api.get(await request('GET', null, 'bob'), id)).status, 404);
  assert.equal((await api.download(await request('GET', null, 'bob'), id)).status, 404);
  assert.equal((await api.put(await request('PUT', payload, 'bob'), id)).status, 409);
  assert.equal((await api.put(await request('PUT', payload, 'alice', { origin: 'https://other.example' }), randomUUID())).status, 403);
  assert.equal((await api.put(await request('PUT', payload, 'alice', { 'X-Rock-Owner-Scope': await ownerScopeFor('bob') }), randomUUID())).status, 409);
  assert.equal(await (await api.download(await request(), id)).text(), 'print(123)'); assert.equal(blobs.size, 1);
  assert.equal((await api.remove(await request('DELETE', { revision: 1 }, 'bob'), id)).status, 409);
  assert.equal((await api.remove(await request('DELETE', { revision: 1 }), id)).status, 200);
  assert.equal((await api.put(await request('PUT', payload), id)).status, 409);
  assert.equal((await api.download(await request(), id)).status, 404);
});
void test('drafts enforce file consent, paths, content and account quota without claiming connection', async t => {
  const { api, sqlite } = fixture(t), payload = value();
  assert.equal((await api.put(await request('PUT', { ...payload, content: { ...payload.content, rights: false } }), randomUUID())).status, 400);
  const form = new FormData(); form.set('draft', JSON.stringify(payload)); form.set('source', new File(['code'], '.env'));
  assert.equal((await api.put(await request('PUT', form), randomUUID())).status, 400);
  for (let i=0;i<32;i++) assert.equal((await api.put(await request('PUT', { ...payload, commandId: randomUUID() }), randomUUID())).status, 201);
  assert.equal((await api.put(await request('PUT', payload), randomUUID())).status, 429);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM noah_agent_uploads').get().n, 0);
});
void test('usage reads durable Work once, isolates owners, distinguishes unknown cost and historical duration', async t => {
  const { db, sqlite } = fixture(t), now = Date.now();
  const insert = (owner, execution) => sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(randomUUID(),owner,JSON.stringify({ templateId:'noah-agent-local',createdAt:new Date(now-5000).toISOString(),noahExecution:{ agentId:'agent-a',recipe:'official-agent',state:'returned',result:{exitCode:0}, ...execution } }),1,new Date(now).toISOString());
  insert('alice', { startedAt:now-4000,completedAt:now-1000,chargeMinor:0 });
  insert('alice', {}); insert('bob', { state:'failed' });
  const personal = await noahUsageReport(db,'alice',{},undefined,now);
  const source = personal.sources.find(s=>s.source==='local_agent');
  assert.equal(source.metrics.runs,2); assert.equal(source.metrics.succeeded,2); assert.equal(source.metrics.durationMs,3000);
  assert.equal(source.metrics.measuredDurationRuns,1); assert.equal(source.metrics.knownCostRuns,0); assert.deepEqual(source.costs,[]);
  assert.ok(source.recent.every(r=>r.actorId==='自分' && r.costMinor===null));
  const publisher = await noahUsageReport(db,'alice',{scope:'publisher'},undefined,now);
  assert.equal(publisher.sources.find(s=>s.source==='local_agent').metrics.runs,0);
  await assert.rejects(noahUsageReport(db,'alice',{scope:'operator'},undefined,now),{status:403});
  const operator = await noahUsageReport(db,'operator',{scope:'operator'},'["operator"]',now);
  assert.equal(operator.sources.find(s=>s.source==='local_agent').metrics.runs,3);
});

void test('a returned Agent error is not counted as successful usage', async t => {
  const { db, sqlite } = fixture(t), now = Date.now();
  sqlite.prepare('INSERT INTO work_jobs VALUES(?,?,?,?,?)').run('failed-result','alice',JSON.stringify({templateId:'noah-agent-local',createdAt:new Date(now-1000).toISOString(),noahExecution:{agentId:'aider',recipe:'aider',state:'returned',result:{exitCode:1}}}),1,new Date(now).toISOString());
  const report = await noahUsageReport(db,'alice',{},undefined,now);
  const result = report.sources.find(s=>s.source==='local_agent');
  assert.equal(result.metrics.succeeded,0); assert.equal(result.metrics.failed,1);
});

void test('terminal Work attributes usage to the exact owned upload, not another publisher or a mismatched pin', async t => {
  const { db, sqlite } = fixture(t), now = Date.now(), uploadId = randomUUID(), manifestSha = 'a'.repeat(64), sourceSha = 'b'.repeat(64);
  sqlite.prepare('INSERT INTO noah_agent_uploads (id,owner_id,manifest,manifest_sha256,source_sha256,upload_state,created_at,source_key,source_name,source_bytes) VALUES(?,?,?,?,?,?,?,?,?,?)').run(uploadId,'alice',JSON.stringify({name:'Uploaded terminal Agent'}),manifestSha,sourceSha,'ready',now,'test-source','fixture.zip',4);
  const insert = (owner, sha) => sqlite.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)').run(randomUUID(), owner, JSON.stringify({templateId:'noah-agent-local',createdAt:new Date(now-5000).toISOString(),noahExecution:{agentId:uploadId,recipe:'terminal',state:'returned',result:{exitCode:0},source:{uploadId,manifestSha256:manifestSha,sourceSha256:sha}}}),1,new Date(now).toISOString());
  insert('alice',sourceSha); insert('bob',sourceSha); insert('alice','c'.repeat(64));
  const report = await noahUsageReport(db,'alice',{scope:'publisher'},undefined,now);
  const source = report.sources.find(s=>s.source==='local_agent');
  assert.equal(source.metrics.runs,1); assert.equal(source.agents[0].agentRef,'noah-upload:'+uploadId); assert.equal(source.agents[0].name,'Uploaded terminal Agent');
  const other = await noahUsageReport(db,'bob',{scope:'publisher'},undefined,now);
  assert.equal(other.sources.find(s=>s.source==='local_agent').metrics.runs,0);
});

void test('draft preserves incomplete terminal settings but never accepts executable host options', async t => {
  const { api } = fixture(t), payload = value(), id = randomUUID();
  payload.content.manifest.runtime = {schema:'noah-terminal/1',language:'python',entrypoint:'',model:'none'};
  assert.equal((await api.put(await request('PUT',payload),id)).status,201);
  const saved = await (await api.get(await request(),id)).json();
  assert.equal(saved.draft.content.manifest.runtime.entrypoint,'');
  payload.content.manifest.runtime.command = 'open Safari';
  assert.equal((await api.put(await request('PUT',payload),randomUUID())).status,400);
});

void test('a provider can report a ready owned upload and safely retry the same execution', async t => {
  const { db, sqlite } = fixture(t);
  const agentId = randomUUID();
  sqlite.prepare(`INSERT INTO noah_agent_uploads
    (id, owner_id, manifest, manifest_sha256, upload_state, created_at)
    VALUES (?, 'alice', ?, ?, 'ready', ?)`).run(agentId, JSON.stringify({ name: 'Usage fixture' }), 'a'.repeat(64), Date.now());

  let owner = 'alice';
  const token = 'sky_dev_' + randomUUID();
  const input = {
    noahUrl: 'https://noah.example', developerToken: token, agentId,
    installationId: 'test-installation', eventId: randomUUID(), occurredAt: new Date().toISOString(),
    durationMs: 200, outcome: 'succeeded',
    async fetchImpl(url, init) {
      assert.equal(url, 'https://noah.example/api/sky/tool-events');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.Authorization, 'Bearer ' + token);
      const event = parseSkyToolEvent(JSON.parse(init.body));
      return Response.json(await skyToolEventStore(db).record(owner, event));
    },
  };
  assert.deepEqual(await reportNoahAgentUsage(input), { recorded: true, replay: false });
  assert.deepEqual(await reportNoahAgentUsage(input), { recorded: true, replay: true });
  await assert.rejects(reportNoahAgentUsage({ ...input, durationMs: 201 }), { status: 403 });
  owner = 'bob';
  await assert.rejects(reportNoahAgentUsage(input), { status: 403 });
  owner = 'alice';
  sqlite.prepare("UPDATE noah_agent_uploads SET upload_state = 'pending' WHERE id = ?").run(agentId);
  await assert.rejects(reportNoahAgentUsage({ ...input, eventId: randomUUID() }), { status: 403 });
  sqlite.prepare("UPDATE noah_agent_uploads SET upload_state = 'ready', deleted_at = ? WHERE id = ?").run(Date.now(), agentId);
  await assert.rejects(reportNoahAgentUsage({ ...input, eventId: randomUUID() }), { status: 403 });

  const at = Date.now() + 1;
  for (const [user, runs] of [['alice', 1], ['bob', 0]]) {
    const report = await noahUsageReport(db, user, { scope: 'publisher', agent: 'noah-upload:' + agentId }, undefined, at);
    const { metrics, costs } = report.sources.find(source => source.source === 'reported');
    assert.equal(metrics.runs, runs);
    assert.deepEqual(costs, []);
  }
});

void test('the usage reporter validates the destination and retry identity before sending', async () => {
  const input = {
    noahUrl: 'https://noah.example', developerToken: 'sky_dev_' + randomUUID(),
    eventId: randomUUID(), occurredAt: new Date().toISOString(),
    fetchImpl() { throw new Error('Unexpected request during validation'); },
  };
  for (const url of ['http://noah.example', 'https://user@noah.example', 'https://noah.example/path']) {
    await assert.rejects(reportNoahAgentUsage({ ...input, noahUrl: url }), /HTTPS origin/);
  }
  await assert.rejects(reportNoahAgentUsage({ ...input, occurredAt: undefined }), /timestamp/);
  const fetchImpl = () => Promise.resolve(new Response('unavailable', { status: 503 }));
  await assert.rejects(reportNoahAgentUsage({ ...input, fetchImpl }), { status: 503 });
});
