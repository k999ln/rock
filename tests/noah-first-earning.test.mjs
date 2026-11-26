import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createNoahFirstEarningApi } from '../lib/noah-first-earning-api.ts';
import { FIRST_EARNING_LIMIT_MS, noahFirstEarningStore } from '../lib/noah-first-earning.ts';
import { createNoahCloudApi, createNoahCloudResultApi } from '../lib/noah-cloud-api.ts';
import { NOAH_CLOUD_PROFILES, NOAH_EVE_HERMES_PROJECT } from '../lib/noah-cloud-contract.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from '../lib/owner-intent.ts';
import { fixture } from './fixtures/noah/intake.mjs';

const origin = 'https://noah.test';
const pilotPath = '/api/noah/first-earning';
const cloudPath = '/api/noah/cloud-agents';
const seller = 'first-seller', reviewer = 'pilot-reviewer', other = 'other-seller';
const project = NOAH_EVE_HERMES_PROJECT;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const profile = NOAH_CLOUD_PROFILES.hermes;
const request = async (path, who, input) => new Request(origin + path, {
  ...(input ? { method: 'POST', body: JSON.stringify(input) } : {}),
  headers: { 'X-Test-User': who, Origin: origin, 'Content-Type': 'application/json', [OWNER_SCOPE_HEADER]: await ownerScopeFor(who) },
});

async function setup(t) {
  const f = fixture(t);
  const sql = readFileSync(new URL('../drizzle/0060_noah_first_earning.sql', import.meta.url), 'utf8');
  assert.equal(sql, readFileSync(new URL('../drizzle-main/0060_noah_first_earning.sql', import.meta.url), 'utf8'));
  f.sql.exec(sql);
  f.sql.exec(sql); // A local preview can apply the same migration again safely.
  const scope = await ownerScopeFor(seller);
  const authenticate = async req => req.headers.get('X-Test-User');
  const pilot = createNoahFirstEarningApi({ db: f.db, now: f.time, authenticate, open: true, reviewers: [reviewer] });
  const get = (who, target) => request(pilotPath + (target ? '?' + new URLSearchParams({ scope: target }) : ''), who).then(pilot);
  const post = (who, action, values) => request(pilotPath, who, { action, ...values }).then(pilot);
  const status = async () => (await (await get(seller)).json()).firstEarning;
  const use = async (who, action, fields = {}) => {
    const result = await post(who, action, { revision: (await status())?.revision, ...(who === reviewer ? { scope } : {}), ...fields });
    assert.equal(result.status, 200, await result.clone().text());
    return (await result.json()).firstEarning;
  };
  return { f, scope, authenticate, get, post, status, use, store: noahFirstEarningStore(f.db) };
}

void test('only an independently checked bank deposit unlocks the offer; seller can deliver and correct a report after the cap', async t => {
  const w = await setup(t);
  assert.equal((await w.get(other, w.scope)).status, 404);
  assert.equal((await w.post(seller, 'enroll', { scope: w.scope })).status, 403);
  await w.use(reviewer, 'enroll');
  assert.equal((await w.post(seller, 'deliver', { revision: 1 })).status, 409);
  const contracted = await w.use(reviewer, 'contract', { reference: 'coconala-987654' });
  assert.equal(contracted.offerPaidPlan, false);
  // Start the real admission API with most of the time already used.
  const populate = w.f.sql.prepare("INSERT INTO noah_first_earning_runs VALUES (?, ?, 'free', ?, ?, ?)");
  for (let n = 0; n < 37; n++) populate.run(w.scope, id(100 + n), 240_000, w.f.time(), 240_000);
  populate.run(w.scope, id(70), 240_000, w.f.time(), 119_000);

  const key = 'test-only-secret-'.repeat(3), starts = [];
  const cloud = createNoahCloudApi({
    db: w.f.db, now: w.f.time, authenticate: w.authenticate, firstEarning: true, freeRuntime: true, receiptKey: key,
    authorize: async () => {},
    directory: async () => [{ card: { id: project, href: profile.repository, name: 'Hermes', sources: [] }, families: [] }],
    runtime: async input => {
      if (input.action === 'status') return Response.json({ trialProtocol: 1 });
      starts.push(input);
      return Response.json({ id: input.jobId, profile: 'hermes', version: profile.version, distribution: profile.sha256, mode: 'run', state: 'running', calls: 0 });
    },
  });
  const start = jobId => request(cloudPath, seller, { action: 'start', projectId: project, jobId, connectionId: id(80), prompt: '制作例' }).then(cloud);
  assert.equal((await start(id(81))).status, 202);
  assert.equal(starts[0].trial.ms, 1000);
  assert.equal((await start(id(82))).status, 429);
  assert.equal(starts.length, 1);
  const result = createNoahCloudResultApi({ db: w.f.db, receiptKey: key, now: w.f.time });
  const receipt = () => result(new Request(origin + cloudPath + '/result', {
    method: 'POST', headers: { Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      ticket: starts[0].receipt,
      job: { id: id(81), profile: 'hermes', version: profile.version, distribution: profile.sha256, mode: 'run', state: 'returned', activeMs: 1000, calls: 1, result: { text: '成果物', files: [], exitCode: 0, calls: 1 } },
    }),
  }));
  assert.equal((await receipt()).status, 200);
  assert.equal((await receipt()).status, 200);
  assert.equal((await w.status()).usedMs, FIRST_EARNING_LIMIT_MS);
  const saved = await request(`${cloudPath}?projectId=${project}&jobId=${id(81)}`, seller).then(cloud);
  assert.equal((await saved.json()).job.result.text, '成果物');
  assert.equal((await w.use(seller, 'deliver')).offerPaidPlan, false);
  assert.equal((await w.use(reviewer, 'payoutPending')).offerPaidPlan, false);
  assert.equal((await w.post(seller, 'reportBank', { revision: (await w.status()).revision, amountYen: 0, bankDate: '2026-11-20' })).status, 400);
  const reported = await w.use(seller, 'reportBank', { amountYen: 3900, bankDate: '2026-11-20' });
  assert.equal(reported.offerPaidPlan, false);
  assert.equal((await w.post(seller, 'verifyBank', { revision: reported.revision, reference: 'case-000001', checked: true })).status, 403);
  assert.equal((await w.post(reviewer, 'verifyBank', { scope: w.scope, revision: reported.revision, reference: 'case-000001' })).status, 403);
  const confirmed = await w.use(reviewer, 'verifyBank', { reference: 'case-000001', checked: true });
  assert.equal(confirmed.offerPaidPlan, true);
  assert.equal(confirmed.amountYen, 3900);
  assert.equal((await w.use(reviewer, 'returnBank')).offerPaidPlan, false);
});

void test('reservations are atomic and shared across runtimes, replays and calendar days', async t => {
  const w = await setup(t);
  await w.use(reviewer, 'enroll');
  const reserve = n => w.store.reserve(w.scope, id(n), 'free', w.f.time());
  const runs = await Promise.allSettled(Array.from({ length: 12 }, (_, n) => reserve(n + 1)));
  assert.equal(runs.filter(r => r.status === 'fulfilled').length, 8);
  assert.equal((await w.status()).usedMs, 30 * 60_000);
  assert.deepEqual(await reserve(1), await reserve(1));
  await assert.rejects(w.store.reserve(w.scope, id(1), 'managed', w.f.time()), { status: 409 });
  await w.store.settle(w.scope, id(1), 50);
  await w.store.settle(w.scope, id(1), 0);
  await reserve(40);
  w.f.advance(3 * 86_400_000);
  await assert.rejects(reserve(41), { status: 429 });
  await assert.rejects(reserve(2), { status: 409 });
  await w.use(reviewer, 'contract', { reference: 'coconala-987654' });
  assert.ok(await w.store.reserve(w.scope, id(41), 'managed', w.f.time()));
});
