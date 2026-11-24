import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/noah/intake.mjs';
import { createNoahAskApi } from '../lib/noah-ask.ts';
import { createNoahCloudApi, createNoahCloudResultApi } from '../lib/noah-cloud-api.ts';
import { NOAH_CLOUD_PROFILES, noahCloudDigest, noahCloudListYen } from '../lib/noah-cloud-contract.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { workStore } from '../lib/work-store.ts';
import * as askView from '../lib/noah-ask-view.ts';
import * as ownerIntent from '../lib/owner-intent.ts';
import { screen } from './fixtures/noah/screen.mjs';

const origin = 'https://noah.test', project = 'project-' + 'a'.repeat(64);
async function setup(t) {
  const f = fixture(t), records = new Map(), key = crypto.randomUUID() + crypto.randomUUID();
  let owner = 'owner-a', dispatches = 0, failStop = false, receipt;
  const profile = NOAH_CLOUD_PROFILES.memory;
  const cloud = createNoahCloudApi({ db: f.db, now: f.time, receiptKey: key,
    authenticate: async () => owner, authorize: async () => {},
    directory: async () => [{ card: { id: project, feedbackId: project, name: 'Memory', href: profile.repository, sources: [] }, families: [] }],
    runtime: async input => {
      dispatches++;
      if (input.action === 'start') {
        receipt = input.receipt;
        records.set(input.jobId, { id: input.jobId, profile: 'memory', version: profile.version, distribution: profile.sha256, mode: 'run', state: 'running', calls: 0 });
      } else if (input.action === 'stop') {
        if (failStop) return Response.json({ error: 'unavailable' }, { status: 503 });
        records.get(input.jobId).state = 'cancelled';
      }
      return Response.json(records.get(input.jobId));
    },
  });
  const api = createNoahAskApi({ ...f.deps, authenticate: async () => owner, reviewers: [],
    flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }), cloudApi: cloud });
  const post = async (url, body, headers = {}) => new Request(origin + url, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(owner), ...headers }, body: JSON.stringify(body) });
  const jobId = crypto.randomUUID(), connectionId = crypto.randomUUID();
  const start = await cloud(await post('/api/noah/cloud-agents', { action: 'start', projectId: project, jobId, connectionId, prompt: 'Remember the acceptance test' }));
  assert.equal(start.status, 202);
  const deliver = async (usage) => {
    f.advance(1000);
    const text = 'Saved memory', bytes = 'acceptance-memory\n';
    const result = { exitCode: 0, calls: 1, text, files: [{ name: 'memory.jsonl', base64: Buffer.from(bytes).toString('base64'), bytes: Buffer.byteLength(bytes), sha256: await noahCloudDigest(bytes) }] };
    const job = { ...records.get(jobId), state: 'returned', calls: 1, ...(usage ? { usage } : {}), result };
    const response = await createNoahCloudResultApi({ db: f.db, receiptKey: key, now: f.time })(new Request(origin + '/api/noah/cloud-agents/result', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: receipt, job }),
    }));
    assert.equal(response.status, 200);
  };
  return { f, api, jobId, connectionId, deliver, post, owner: value => { owner = value; }, count: () => dispatches, failStop: () => { failStop = true; },
    list: query => api.collection(new Request(origin + '/api/noah/ask' + (query || ''))),
    get: (id = jobId) => api.item(new Request(origin + '/api/noah/ask/' + id), id),
    stop: async (revision, headers) => api.item(await post('/api/noah/ask/' + jobId, { action: 'stop', revision }, headers), jobId),
  };
}

void test('server callback results appear in common results and detail without waking execution', async t => {
  const w = await setup(t);
  await w.deliver();
  const count = w.count();
  const row = (await (await w.list()).json()).asks[0];
  assert.equal(row.id, w.jobId); assert.equal(row.state, 'succeeded'); assert.equal(row.mode, 'cloud');
  assert.equal(row.agentId, project); assert.equal(row.result, undefined); assert.equal(row.cloudFiles, undefined);
  const detail = await (await w.get()).json();
  assert.equal(detail.result.text, 'Saved memory'); assert.equal(detail.cloudFiles[0].name, 'memory.jsonl');
  assert.equal(Buffer.from(detail.cloudFiles[0].base64, 'base64').toString(), 'acceptance-memory\n');
  assert.equal(w.count(), count, 'Saved history must never poll the runtime or recreate a job');
  const persisted = await workStore(w.f.db).get('owner-a', w.jobId);
  assert.equal(persisted.status, 'review'); assert.equal(persisted.steps[0].passed, false);
  // Unrelated recent work must not push a saved cloud result out of its filtered history.
  for (let i = 0; i < 101; i++) {
    const other = structuredClone(persisted); other.id = crypto.randomUUID(); delete other.noahRemote.cloud;
    other.updatedAt = new Date(w.f.time() + 1000 + i).toISOString();
    await workStore(w.f.db).create('owner-a', other);
  }
  assert.equal((await (await w.list()).json()).asks[0].id, w.jobId);
});

void test('the common detail reads only meters attached to this owner and this Work', async t => {
  const w = await setup(t);
  const usage = { inputTokens: 3000, outputTokens: 200, neurons: 61 };
  await w.deliver(usage);
  const before = w.count();
  const detail = await (await w.get()).json();
  const receipt = detail.usageReceipt;
  assert.equal(receipt.source, 'managed-cloud');
  assert.equal(receipt.agentVersion, NOAH_CLOUD_PROFILES.memory.version);
  assert.equal(receipt.metrics.modelCalls, 1);
  assert.equal(receipt.metrics.inputTokens, usage.inputTokens);
  assert.equal(receipt.metrics.outputTokens, usage.outputTokens);
  assert.equal(receipt.metrics.neurons, usage.neurons);
  assert.equal(receipt.pricingBasis, 'included');
  assert.equal(receipt.externalCharge, 'not-applicable');
  assert.equal(receipt.estimateYen, noahCloudListYen(usage));
  assert.deepEqual((await (await w.get()).json()).usageReceipt, receipt);

  const ui = screen({
    modules: { '@/lib/noah-ask-view': askView, '@/lib/owner-intent': ownerIntent },
    fetch: async ({ method, url }) => {
      assert.equal(method, 'GET');
      assert.equal(url, '/api/noah/ask/' + w.jobId);
      return { body: await (await w.get()).json() };
    },
  });
  const page = ui.mount('components/noah-task-detail.tsx', { id: w.jobId });
  await page.flush();
  assert.match(page.text(), /Saved memory/);
  const panel = page.find('section').find(node => node.props['aria-label'] === 'この仕事の利用明細');
  assert.ok(panel);
  const lines = page.text(panel);
  assert.match(lines, /Noah利用料（確定額）[￥¥]0（無料枠）/);
  assert.match(lines, /モデルへの入力3,000 トークン/);
  assert.match(lines, /モデルからの出力200 トークン/);
  assert.match(lines, /モデルの計算量61 neuron/);
  assert.match(lines, /有料プラン換算（参考）約 [￥¥]0\.1/);

  // An older result from the same Agent can have recorded calls but no token meter.
  const legacy = await workStore(w.f.db).get('owner-a', w.jobId);
  legacy.id = crypto.randomUUID();
  delete legacy.noahRemote.cloud.usage;
  delete legacy.noahRemote.cloud.reportedModelCalls;
  delete legacy.noahRemote.cloud.freeTier;
  await workStore(w.f.db).create('owner-a', legacy);
  const older = await (await w.get(legacy.id)).json();
  assert.equal(older.result.text, detail.result.text);
  assert.equal(older.usageReceipt.metrics.modelCalls, 1);
  assert.equal(older.usageReceipt.metrics.inputTokens, null);
  assert.equal(older.usageReceipt.metrics.outputTokens, null);
  assert.equal(older.usageReceipt.metrics.neurons, null);
  assert.equal(older.usageReceipt.pricingBasis, null, 'an old zero relay field does not certify free-tier billing');
  assert.equal(older.usageReceipt.estimateYen, null);

  w.owner('owner-b');
  for (const id of [w.jobId, legacy.id]) {
    const response = await w.get(id);
    assert.equal(response.status, 404);
    const denied = await response.json();
    assert.equal(denied.usageReceipt, undefined);
    assert.equal(denied.result, undefined);
  }
  assert.equal(w.count(), before);
});

void test('common cloud results enforce owner and connection/project filters', async t => {
  const w = await setup(t); await w.deliver();
  assert.equal((await (await w.list('?agent=' + project)).json()).asks.length, 1);
  assert.equal((await (await w.list('?connection=' + w.connectionId)).json()).asks.length, 1);
  assert.equal((await (await w.list('?connection=' + crypto.randomUUID())).json()).asks.length, 0);
  assert.equal((await (await w.list('?agent=project-' + 'b'.repeat(64))).json()).asks.length, 0);
  w.owner('owner-b');
  assert.equal((await (await w.list()).json()).asks.length, 0);
  assert.equal((await w.get()).status, 404);
  assert.equal((await w.stop(1)).status, 404);
});

void test('common stop checks revision and Origin before stopping the real cloud job', async t => {
  const w = await setup(t), current = await (await w.get()).json(), count = w.count();
  assert.equal((await w.stop(current.revision + 1)).status, 409);
  assert.equal((await w.stop(current.revision, { Origin: 'https://other.test' })).status, 403);
  assert.equal((await w.stop(current.revision, { 'X-Rock-Owner-Scope': 'changed' })).status, 409);
  assert.equal(w.count(), count);
  const stopped = await w.stop(current.revision); assert.equal(stopped.status, 200);
  const result = await stopped.json(); assert.equal(result.state, 'stopped');
  assert.equal(w.count(), count + 1);
  assert.equal((await w.stop(result.revision)).status, 200);
  assert.equal(w.count(), count + 1, 'Repeated stop does not dispatch or resume a terminal job');
});

void test('failed cloud stop preserves the running state instead of claiming it stopped', async t => {
  const w = await setup(t), current = await (await w.get()).json(); w.failStop();
  assert.equal((await w.stop(current.revision)).status, 503);
  assert.equal((await (await w.get()).json()).state, 'running');
});
