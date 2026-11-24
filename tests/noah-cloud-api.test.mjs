import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoahCloudApi, createNoahCloudResultApi, noahCloudRuntime } from '../lib/noah-cloud-api.ts';
import { eveAdviceProposal, eveReturnedProposal } from '../lib/eve-consultation-proposal.ts';
import { noahProjectDetail } from '../lib/noah-project-api.ts';
import { noahBrowserRequestAllowed } from '../lib/noah-browser-session.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { NOAH_CLOUD_PROFILES, NOAH_EVE_HERMES_PROJECT } from '../lib/noah-cloud-contract.ts';
import { NoahAgentError } from '../lib/noah-agent-upload.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const distribution = NOAH_CLOUD_PROFILES.hermes.sha256, version = NOAH_CLOUD_PROFILES.hermes.version;
const project = NOAH_EVE_HERMES_PROJECT, origin = 'https://noah.test';
const entry = { cloudProfile: 'hermes', card: { id: project, feedbackId: project, href: 'https://github.com/NousResearch/hermes-agent', name: 'Hermes', sources: [] }, families: [] };
async function world(t, freeRuntime = false) {
  const f = fixture(t); let owner = 'owner-a', listed = true, denied = false, confirmRequired = false, count = 0, admissionStatus = 200, receipt;
  const secret = crypto.randomUUID() + crypto.randomUUID();
  const records = new Map(), starts = [];
  const api = createNoahCloudApi({ db: f.db, now: f.time, receiptKey: secret, freeRuntime, authenticate: async () => owner, directory: async () => listed ? [entry, { ...entry, cloudProfile: 'memory', card: { ...entry.card, id: 'project-' + 'b'.repeat(64), feedbackId: 'project-' + 'b'.repeat(64), href: NOAH_CLOUD_PROFILES.memory.repository } }] : [], authorize: async (_owner, _target, _action, _digest, confirmed) => { if (denied) throw Error('DENIED'); if (confirmRequired && !confirmed) throw new NoahAgentError('毎回確認してください', 409); }, runtime: async input => {
    count++;
    if (input.action === 'start') { starts.push(input); receipt = input.receipt; if (admissionStatus !== 200) return Response.json({ error: '利用枠が埋まっています' }, { status: admissionStatus }); const old = records.get(input.jobId); if (!old) records.set(input.jobId, { id: input.jobId, purpose: input.purpose, profile: input.profile, version, distribution, mode: 'run', state: 'running', calls: 0 }); return Response.json(records.get(input.jobId)); }
    if (input.action === 'stop' && records.has(input.jobId)) { const stopped = {...records.get(input.jobId),state:'cancelled'}; records.set(input.jobId,stopped); return Response.json(stopped); }
    if (input.action === 'job') return records.has(input.jobId) ? Response.json(records.get(input.jobId)) : Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({ connection: null });
  } });
  const request = async (body, headers = {}) => api(new Request(origin + '/api/noah/cloud-agents', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Rock-Owner-Scope': await ownerScopeFor(owner), ...headers }, body: JSON.stringify({ projectId: project, ...body }) }));
  const resultApi = createNoahCloudResultApi({ db: f.db, receiptKey: secret, now: f.time });
  const deliver = (job, patch = {}, headers = {}) => resultApi(new Request(origin + '/api/noah/cloud-agents/result', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, ...headers }, body: JSON.stringify({ ticket: receipt, job, ...patch }) }));
  return { f, api, records, starts, request, deliver, requireConfirmation: () => { confirmRequired = true; }, admission: status => { admissionStatus = status; }, calls: () => count, owner: v => { owner = v; }, listed: v => { listed = v; }, deny: () => { denied = true; } };
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
void test('Eve consultations use the official free Hermes runtime and return only actual owned consultation jobs', async t => {
  const w = await world(t, true), purpose = 'eve-engineering';
  const start = { action: 'start', connectionId: id(1), jobId: id(2), prompt: 'Design an agent to sort an example reading list.' };
  const status = () => w.api(new Request(`${origin}/api/noah/cloud-agents?projectId=${project}&purpose=${purpose}`));
  assert.equal((await w.request({ ...start, purpose, projectId: 'project-' + '1'.repeat(64) })).status, 400);
  assert.equal(w.calls(), 0);
  assert.equal((await w.request({ ...start, jobId: id(3) })).status, 202);
  assert.equal((await w.request({ ...start, jobId: id(3), purpose })).status, 409);
  assert.deepEqual((await (await status()).json()).jobs, []);
  w.requireConfirmation();
  assert.equal((await w.request({ ...start, purpose })).status, 409);
  assert.equal((await w.request({ ...start, purpose, confirm: true })).status, 202);
  assert.equal(w.starts.at(-1).purpose, undefined);
  const actualText = 'Fixture generated reply for the reading list';
  const job = { ...w.records.get(start.jobId), state: 'returned', calls: 2, result: { text: actualText, files: [], exitCode: 0 } };
  assert.equal((await w.deliver(job)).status, 200);
  const { jobs } = await (await status()).json();
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].result.text, actualText);
  assert.equal(jobs[0].calls, 2);
  w.owner('different-owner');
  assert.deepEqual((await (await status()).json()).jobs, []);
  const paid = await world(t, false);
  assert.equal((await paid.request({ ...start, purpose, confirm: true })).status, 503);
  assert.equal(paid.calls(), 0);
});
void test('Eve sends a bounded combination brief with the confirmed goal and saves only a grounded, owned proposal', async t => {
  const w = await world(t, true), purpose = 'eve-engineering', prompt = '自分のブログで会議の内容を整理したい';
  const start = { action: 'start', jobId: id(2), connectionId: id(1), purpose, proposalLanguage: 'ja', prompt };
  w.requireConfirmation();
  assert.equal((await w.request(start)).status, 409);
  assert.deepEqual(w.starts, []);
  assert.equal((await w.request({ ...start, confirm: true, prompt: 'あ'.repeat(3960) })).status, 400);
  assert.equal((await w.request({ ...start, confirm: true, proposalLanguage: 'invalid' })).status, 400);
  assert.deepEqual(w.starts, []);
  assert.equal((await w.request({ ...start, confirm: true })).status, 202);
  assert.match(w.starts[0].prompt, /A catalog design example passes "記事の指示"/u);
  assert.equal(w.starts[0].purpose, 'eve-combination-advice');
  assert.match(w.starts[0].prompt, /^Return exactly one JSON object/u);
  assert.match(w.starts[0].prompt, /memory: organize supplied notes/u);
  assert.match(w.starts[0].prompt, /recording symptoms only requires a usable log/u);
  assert.match(w.starts[0].prompt, /an approved application, a purchase, or payment/u);
  assert.doesNotMatch(w.starts[0].prompt, /filesystem:/u, 'absent store profiles are not offered');
  assert.doesNotMatch(w.starts[0].prompt, /memory function|MEMORY.md/u);
  assert.ok(w.starts[0].prompt.endsWith('\n' + prompt));
  assert.equal((await w.request({ ...start, confirm: true, proposalLanguage: 'en' })).status, 409);
  const scheme = { kind: 'user_goal', recipient: '編集担当者', outcome: '確認用の記事案', acceptance: '担当者が内容を確認して掲載枠を決める', evidence: '記事案に対する担当者のレビュー記録' };
  const generated = JSON.stringify({ input: '会議のメモ', scheme, steps: [
    { agent: 'memory', role: '担当者ごとに論点を整理', output: '担当と論点の表' },
    { agent: null, role: '記事を下書きするAgent', output: '確認用の記事案' },
  ] });
  const job = { ...w.records.get(start.jobId), state: 'returned', calls: 1, result: { text: generated, files: [], exitCode: 0, calls: 1, operationCount: 0 } };
  assert.notEqual((await w.deliver({ ...job, purpose: undefined })).status, 200);
  assert.equal((await w.deliver(job)).status, 200);
  const status = () => w.api(new Request(`${origin}/api/noah/cloud-agents?projectId=${project}&purpose=${purpose}`));
  const { jobs } = await (await status()).json();
  assert.equal(jobs[0].prompt, prompt);
  assert.equal(jobs[0].proposal.steps[1].input, jobs[0].proposal.steps[0].output);
  assert.equal(jobs[0].proposal.steps[1].profile, null);
  assert.equal(jobs[0].proposal.steps[0].projectId, 'project-' + 'b'.repeat(64));
  assert.equal(jobs[0].proposal.deliverable, '確認用の記事案');
  assert.deepEqual(jobs[0].proposal.scheme, scheme);
  assert.equal(jobs[0].proposalBrief, undefined);
  assert.equal(jobs[0].runtimePurpose, 'eve-combination-advice');
  const stored = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(start.jobId).payload);
  assert.deepEqual(stored.noahRemote.used, []);
  assert.equal(stored.noahRemote.toolCalls, 0);
  assert.equal(stored.noahRemote.modelCalls, 1);
  const generic = await w.api(new Request(`${origin}/api/noah/cloud-agents?projectId=${project}`));
  assert.deepEqual((await generic.json()).jobs, []);
  assert.equal((await w.request({ ...start, confirm: true })).status, 200);
  assert.equal(w.starts.length, 1);
  w.owner('unrelated');
  assert.deepEqual((await (await status()).json()).jobs, []);
});
void test('a pending consultation created before direct advice retries its original Hermes route and brief', async t => {
  const w = await world(t, true);
  const start = { action: 'start', jobId: id(910), connectionId: id(911), purpose: 'eve-engineering', proposalLanguage: 'ja', prompt: '会議を整理する' };
  assert.equal((await w.request(start)).status, 202);
  const sql = w.f.sql, record = JSON.parse(sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(start.jobId).payload);
  delete record.noahRemote.cloud.runtimePurpose;
  record.noahRemote.cloud.proposalBrief = 'earlier authenticated Hermes instructions: ';
  sql.prepare('UPDATE work_jobs SET payload=? WHERE id=?').run(JSON.stringify(record), start.jobId);
  delete w.records.get(start.jobId).purpose;
  const response = await w.request(start);
  assert.equal(response.status, 202);
  assert.equal(w.starts.at(-1).purpose, undefined);
  assert.equal(w.starts.at(-1).prompt, record.noahRemote.cloud.proposalBrief + start.prompt);
  assert.equal((await response.json()).job.runtimePurpose, undefined);
});

void test('one direct model reply needs a grounded complete proposal and zero tool operations before the Work is returned', async t => {
  const w = await world(t, true);
  const prompt = 'A design', purpose = 'eve-engineering', proposalLanguage = 'en';
  assert.equal((await w.request({ action:'start', purpose:'eve-combination-advice', jobId:id(810), connectionId:id(811), prompt })).status, 400);
  assert.deepEqual(w.starts, []);
  const scheme = { kind:'user_goal', recipient:'Team lead', outcome:'Report', acceptance:'The team lead approves the report', evidence:'Review record' };
  const valid = { calls: 1, operationCount: 0, exitCode: 0, files: [], text: JSON.stringify({ input: 'Notes', scheme, steps: [{agent:'memory',role:'Group notes',output:'Groups'}, {agent:null,role:'Draft',output:'Report'}] }) };
  for (const [index, patch] of [{ operationCount: 1 }, { calls: 2 }, { files: null }, { files: [{}] }, { text: null }, { text: 'done' }, { text: 'Report '+valid.text }, { text: JSON.stringify({ ...JSON.parse(valid.text), scheme: undefined }) }, { text: valid.text.replace('"memory"', '"unknown"') }].entries()) {
    const jobId = id(820+index);
    assert.equal((await w.request({ action:'start', purpose, proposalLanguage, jobId, connectionId:id(811), prompt })).status, 202);
    const job = { ...w.records.get(jobId), state:'returned', calls:1, result:{ ...valid, ...patch }, usage:{inputTokens:100,outputTokens:25,neurons:2} };
    assert.equal((await w.deliver(job)).status, 200);
    const saved = JSON.parse(w.f.sql.prepare('SELECT payload FROM work_jobs WHERE id=?').get(jobId).payload);
    assert.equal(saved.noahRemote.state, 'failed');
    assert.equal(saved.noahRemote.result, undefined);
    assert.equal(saved.noahRemote.cloud.proposal, undefined);
    assert.equal(saved.noahRemote.cloud.usage.neurons, 2);
  }
});
void test('a proposed conversion can end at an approved application without claiming payment or acceptance', () => {
  const scheme = { kind: 'conversion', recipient: '紹介を希望した担当者', outcome: '相談申込', acceptance: '提携先が申込を承認', evidence: '提携先の承認レコード' };
  const model = { input: '相談の希望', steps: [
    { agent: null, role: '希望を整理', output: '候補一覧' },
    { agent: null, role: '候補を紹介', output: '相談申込' },
  ], scheme: { ...scheme, accepted: true } };
  const proposal = eveAdviceProposal(JSON.stringify(model), {});
  assert.deepEqual(proposal.scheme, scheme);
  assert.equal(proposal.accepted, undefined);
  assert.equal(eveAdviceProposal(JSON.stringify({ ...model, scheme: { ...scheme, evidence: '' } }), {}), null);
});

void test('per-job memory can supply the model design, while unlisted or repeated agents never become store recommendations', () => {
  const targets = { memory: 'project-' + 'b'.repeat(64) };
  const shape = { input: 'Notes', steps: [
    { agent: 'memory', role: 'Group notes', output: 'Groups' },
    { agent: null, role: 'Draft action items', output: 'Tasks' },
  ] };
  const saved = JSON.stringify(shape), note = { name: 'MEMORY.md', base64: Buffer.from('# Memory\n' + saved).toString('base64') };
  const legacy = eveReturnedProposal('I saved the plan.', [note], targets);
  assert.equal(legacy.deliverable, 'Tasks');
  assert.equal(legacy.scheme, undefined);
  assert.equal(eveReturnedProposal('I saved the plan.', [], targets), null);
  assert.equal(eveReturnedProposal(saved, [], {}), null);
  for (const agent of ['unlisted', '__proto__', 'memory']) {
    const changed = { ...shape, steps: [shape.steps[0], { ...shape.steps[1], agent }] };
    assert.equal(eveReturnedProposal(JSON.stringify(changed), [], targets), null);
  }
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
