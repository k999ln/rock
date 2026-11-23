import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoahCloudApi, createNoahCloudResultApi, noahCloudRuntime } from '../lib/noah-cloud-api.ts';
import { noahProjectDetail } from '../lib/noah-project-api.ts';
import { noahBrowserRequestAllowed } from '../lib/noah-browser-session.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { NOAH_CLOUD_PROFILES } from '../lib/noah-cloud-contract.ts';
import { NoahAgentError } from '../lib/noah-agent-upload.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const distribution = NOAH_CLOUD_PROFILES.hermes.sha256, version = NOAH_CLOUD_PROFILES.hermes.version;
const project = 'project-' + 'a'.repeat(64), origin = 'https://noah.test';
const entry = { card: { id: project, feedbackId: project, href: 'https://github.com/NousResearch/hermes-agent', name: 'Hermes', sources: [] }, families: [] };
async function world(t) {
  const f = fixture(t); let owner = 'owner-a', listed = true, denied = false, confirmRequired = false, count = 0, admissionStatus = 200, receipt;
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const records = new Map();
  const api = createNoahCloudApi({ db: f.db, now: f.time, receiptKey: secret, authenticate: async () => owner, directory: async () => listed ? [entry] : [], authorize: async (_owner, _target, _action, _digest, confirmed) => { if (denied) throw Error('DENIED'); if (confirmRequired && !confirmed) throw new NoahAgentError('毎回確認してください', 409); }, runtime: async input => {
    count++;
    if (input.action === 'start') { receipt = input.receipt; if (admissionStatus !== 200) return Response.json({ error: '利用枠が埋まっています' }, { status: admissionStatus }); const old = records.get(input.jobId); if (!old) records.set(input.jobId, { id: input.jobId, profile: input.profile, version, distribution, mode: 'run', state: 'running', calls: 0 }); return Response.json(records.get(input.jobId)); }
    if (input.action === 'stop' && records.has(input.jobId)) { const stopped = {...records.get(input.jobId),state:'cancelled'}; records.set(input.jobId,stopped); return Response.json(stopped); }
    if (input.action === 'job') return records.has(input.jobId) ? Response.json(records.get(input.jobId)) : Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ connection: null });
  } });
  const request = async (body, headers = {}) => api(new Request(origin + '/api/noah/cloud-agents', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(owner), ...headers }, body: JSON.stringify({ projectId: project, ...body }) }));
  const resultApi = createNoahCloudResultApi({ db: f.db, receiptKey: secret, now: f.time });
  const deliver = (job, patch = {}, headers = {}) => resultApi(new Request(origin + '/api/noah/cloud-agents/result', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, ...headers }, body: JSON.stringify({ ticket: receipt, job, ...patch }) }));
  return { f, api, records, request, deliver, requireConfirmation: () => { confirmRequired = true; }, admission: status => { admissionStatus = status; }, calls: () => count, owner: v => { owner = v; }, listed: v => { listed = v; }, deny: () => { denied = true; } };
}
void test('cloud capability is only offered for reviewed distributions when deployed, keeping provider choice', () => {
  assert.equal(noahProjectDetail(entry).connection.kind, 'setup');
  assert.deepEqual(noahProjectDetail(entry, true).connection, { kind: 'cloud', profile: 'hermes', providerFamilyId: null });
  assert.equal(noahProjectDetail({ ...entry, card: { ...entry.card, id: 'family' }, families: ['family'] }, true).connection.providerFamilyId, 'family');
  assert.equal(noahProjectDetail({ ...entry, card: { ...entry.card, href: 'https://github.com/unknown/code' } }, true).connection.kind, 'setup');
});
void test('official stdio packages use cloud execution only after deployment and never match lookalike URLs', () => {
  for (const profile of ['time', 'thinking', 'memory', 'filesystem']) {
    const reviewed = NOAH_CLOUD_PROFILES[profile];
    for (const href of [reviewed.repository, ...reviewed.aliases]) {
      const candidate = { ...entry, card: { ...entry.card, href } };
      assert.equal(noahProjectDetail(candidate).connection.kind, 'setup');
      assert.equal(noahProjectDetail(candidate, true).connection.profile, profile);
      assert.equal(noahProjectDetail({ ...candidate, card: { ...candidate.card, href: href + '-fake' } }, true).connection.kind, 'setup');
    }
  }
});
void test('browser permission is confined to the customer cloud API', () => {
  assert.equal(noahBrowserRequestAllowed(new Request(origin + '/api/noah/cloud-agents')), true);
  assert.equal(noahBrowserRequestAllowed(new Request(origin + '/api/noah/cloud-agents/admin', { method: 'POST' })), false);
  assert.equal(noahBrowserRequestAllowed(new Request(origin + '/api/noah/cloud-agents', { method: 'DELETE' })), false);
});
void test('Origin, owner scope, withdrawal, and delegation stop reject before dispatch', async t => {
  const w = await world(t), input = { action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' };
  assert.equal((await w.request(input, { Origin: 'https://other.test' })).status, 403);
  assert.equal((await w.request(input, { 'X-Rock-Owner-Scope': 'wrong' })).status, 409);
  w.listed(false); assert.equal((await w.request(input)).status, 404); w.listed(true);
  w.deny(); assert.equal((await w.request(input)).status, 503); assert.equal(w.calls(), 0);
});
void test('cloud results remain owner-bound, stored as unverified Work, and replay cannot duplicate success', async t => {
  const w = await world(t), input = { action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' };
  const first = await w.request(input); assert.equal(first.status, 202); assert.equal((await first.json()).job.state, 'running');
  assert.equal((await w.request({ ...input, prompt: 'changed' })).status, 409);
  w.records.set(id(1), { id: id(1), profile: 'hermes', version, distribution, mode: 'run', state: 'returned', calls: 1, result: { text: 'result', files: [], exitCode: 0, calls: 1 } });
  const poll = () => w.api(new Request(`${origin}/api/noah/cloud-agents?projectId=${project}&jobId=${id(1)}`));
  assert.equal((await (await poll()).json()).job.result.text, 'result');
  const saved = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(id(1)).payload);
  assert.equal(saved.status, 'review'); assert.equal(saved.steps[0].passed, false); assert.equal(saved.noahRemote.chargeMinor, 0);
  const before = w.calls(); await w.request(input); assert.equal(w.calls(), before, 'finished work must never dispatch again');
  w.owner('owner-b'); assert.equal((await poll()).status, 404); assert.equal(w.calls(), before);
});
void test('an old uncertain start is not automatically replayed', async t => {
  const w = await world(t), input = { action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' };
  await w.request(input); w.f.advance(241000); const count = w.calls();
  w.records.delete(id(1));
  const response = await w.request(input); assert.equal((await response.json()).job.state, 'unknown'); assert.equal(w.calls(), count + 1); assert.equal(w.records.has(id(1)), false, 'only a read is sent; no new runtime record');
});
void test('a late start retry recovers the existing result instead of overwriting it as unknown', async t => {
  const w = await world(t), input = { action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' };
  await w.request(input); w.f.advance(241000);
  w.records.set(id(1), { id: id(1), profile: 'hermes', version, distribution, mode: 'run', state: 'returned', calls: 1, result: { text: 'existing result', files: [], exitCode: 0 } });
  assert.equal((await (await w.request(input)).json()).job.result.text, 'existing result');
});
void test('runtime routing rejects unconfigured hosts and does not follow a redirect', async () => {
  let calls = 0;
  await assert.rejects(noahCloudRuntime({ url: 'https://attacker.test', key: crypto.randomUUID() })( {} ));
  const fn = noahCloudRuntime({ url: 'https://noah-cloud-agents.example.workers.dev', key: crypto.randomUUID() }, async (url, options) => { calls++; assert.equal(options.redirect, 'manual'); assert.equal(new URL(url).pathname, '/rpc'); assert.ok(options.headers.Authorization); return new Response(null, { status: 302 }); });
  await assert.rejects(fn({}), /転送/); assert.equal(calls, 1);
});
void test('completion is saved with the browser closed and refuses unauthenticated or mismatched receipts', async t => {
  const w = await world(t);
  await w.request({ action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' });
  const job = { id: id(1), profile: 'hermes', version, distribution, mode: 'run', state: 'returned', calls: 1, result: { text: 'saved while closed', files: [], exitCode: 0 } };
  assert.equal((await w.deliver(job, {}, { Origin: origin })).status, 401);
  assert.equal((await w.deliver(job, {}, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await w.deliver(job, { ticket: 'a'.repeat(40) })).status, 503);
  assert.equal((await w.deliver({ ...job, id: id(99) })).status, 503);
  assert.equal((await w.deliver({ ...job, distribution: 'b'.repeat(64) })).status, 503);
  assert.equal((await w.deliver(job)).status, 200);
  assert.equal((await w.deliver(job)).status, 200, 'receipt replay is idempotent');
  const saved = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(id(1)).payload);
  assert.equal(saved.noahRemote.result.text, 'saved while closed'); assert.equal(saved.status, 'review');
});
void test('budget rejection leaves a failed Work, not a permanently running spinner', async t => {
  const w = await world(t); w.admission(429);
  assert.equal((await w.request({ action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' })).status, 429);
  const saved = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(id(1)).payload);
  assert.equal(saved.noahRemote.state, 'failed');
});
void test('a saved per-operation confirmation is required before dispatch', async t => {
  const w = await world(t); w.requireConfirmation();
  const input = { action: 'start', jobId: id(1), connectionId: id(2), prompt: 'hello' };
  const first = await w.request(input); assert.equal(first.status, 409); assert.equal((await first.json()).confirmationRequired, true); assert.equal(w.calls(), 0);
  assert.equal((await w.request({ ...input, confirm: true })).status, 202); assert.equal(w.calls(), 1);
});

void test('owned jobs stay stoppable after catalog removal while new work and other owners remain rejected', async t => {
  const w = await world(t);
  await w.request({action:'start',jobId:id(700),connectionId:id(701),prompt:'running'});
  w.listed(false);
  assert.equal((await w.api(new Request(`${origin}/api/noah/cloud-agents?projectId=${project}&jobId=${id(700)}`))).status,200);
  assert.equal((await w.request({action:'start',jobId:id(702),connectionId:id(701),prompt:'new'})).status,404);
  assert.equal((await (await w.request({action:'stop',jobId:id(700)})).json()).job.state,'cancelled');
  w.owner('another-owner');
  assert.equal((await w.request({action:'stop',jobId:id(700)})).status,404);
});

void test('CLI quota rejection does not retry or charge and saved results remain readable through the common result UI', async t => {
  const { createNoahAskApi } = await import('../lib/noah-ask.ts');
  const { parseNoahFlags } = await import('../lib/noah-flags.ts');
  const { screen } = await import('./fixtures/noah/screen.mjs');
  const cloudContract = await import('../lib/noah-cloud-contract.ts');
  const ownerIntent = await import('../lib/owner-intent.ts');
  const askView = await import('../lib/noah-ask-view.ts');
  const myRoutes = await import('../lib/noah-my-routes.ts');
  const pageRoutes = await import('../lib/noah-page-routes.ts');
  const unused = { default: () => null };
  const savedModules = { '@/lib/noah-my-routes': myRoutes, '@/lib/noah-page-routes': pageRoutes,
    './noah-library': unused, './noah-boards': {}, './sky-agent-library': unused, './sky-output-center': unused, './noah-result-data': unused };
  const w = await world(t);
  await w.request({ action: 'start', jobId: id(800), connectionId: id(801), prompt: 'saved input' });
  await w.deliver({ id: id(800), profile: 'hermes', version, distribution, mode: 'run', state: 'returned', calls: 1,
    result: { text: 'quota-independent saved result', files: [], exitCode: 0 } });
  w.admission(429);
  const asks = createNoahAskApi({ ...w.f.deps, authenticate: async () => 'owner-a', reviewers: [],
    flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }), cloudApi: w.api });
  const ui = screen({ modules: { ...savedModules, './noah-ready-detail': { default: () => null }, '@/lib/noah-cloud-contract': cloudContract, '@/lib/owner-intent': ownerIntent, '@/lib/noah-ask-view': askView },
    fetch: async ({url, method, body}) => {
      let response;
      if (method === 'POST') response = await w.request(body);
      else if (url.startsWith('/api/noah/cloud-agents')) {
        response = await w.api(new Request(origin + url));
        const data = await response.json();
        // The fixture runtime has no connection handshake; supply the already connected UI state.
        return { status: response.status, body: { ...data, connection: { id: id(801), state: 'connected' } } };
      } else {
        const request = new Request(origin + url);
        response = url === '/api/noah/ask' ? await asks.collection(request) : await asks.item(request, url.split('/').at(-1));
      }
      return { status: response.status, body: await response.json() };
    } });
  const page = ui.mount('components/noah-cloud-agent.tsx', { projectId: project, profile: 'hermes', providerFamilyId: null });
  await page.flush(); await page.tick(0);
  await page.change(page.find('textarea')[0], 'another request');
  await page.submit(page.find('form')[0]);
  assert.match(page.text(), /利用枠が埋まっています/);
  assert.match(page.text(), /quota-independent saved result/);
  assert.equal(page.find('button', '停止').length, 0);
  const requests = ui.calls.filter(call => call.method === 'POST');
  assert.equal(requests.length, 1);
  const rejected = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(requests[0].body.jobId).payload);
  assert.equal(rejected.noahRemote.state, 'failed');
  assert.equal(rejected.noahRemote.chargeMinor, 0);
  const calls = w.calls();
  await page.tick(60000);
  assert.equal(ui.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(w.calls(), calls);
  // Even explicit replay of that exact rejected request never dispatches again.
  assert.equal((await w.request(requests[0].body)).status, 200);
  assert.equal(w.calls(), calls);
  for (let reload = 0; reload < 2; reload++) {
    const savedHref = myRoutes.noahMyHref('saved', 'results');
    assert.equal(savedHref, '/noah/my?view=saved&tab=results');
    const saved = ui.mount('components/noah-my.tsx', { params: Object.fromEntries(new URL(savedHref, 'https://noah.test').searchParams) });
    await saved.flush();
    assert.match(saved.text(), /quota-independent saved result/);
    assert.ok(saved.find('a').some(link => link.props.href === `/noah/tasks/${id(800)}`));
    const detail = ui.mount('components/noah-task-detail.tsx', { id: id(800) });
    await detail.flush(); await detail.tick(0);
    assert.match(detail.text(), /quota-independent saved result/);
  }
  assert.equal(w.calls(), calls, 'saved-result reads must not consult the CLI runtime or budget');
});
