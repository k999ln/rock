import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { ownerScopeFor } from '../lib/owner-intent.ts';
import {
  launchFixture,
  buyer,
  reviewer,
  origin,
  credential,
  outcome,
} from './helpers/noah-launch-fixture.mjs';

void test('author submits fixed bytes, independent reviewer approves, another user connects, runs and disconnects', async (t) => {
  const f = await launchFixture(t);
  assert.equal(
    (await f.service.catalog()).some((a) => a.kind === 'release'),
    false,
  );
  assert.equal(
    (await f.review(await f.post('author-fixture', f.body))).status,
    403,
  );
  assert.equal((await f.review(await f.post(buyer, f.body))).status, 403);
  const download = await f.review(
    new Request(
      origin +
        '/api/noah/review?source=' +
        encodeURIComponent(f.p.packageKey) +
        '&manifest=' +
        f.p.manifestSha256,
      { headers: { 'test-owner': reviewer } },
    ),
  );
  assert.equal(download.status, 200);
  assert.deepEqual(
    new Uint8Array(await download.arrayBuffer()),
    f.template.bytes,
  );
  assert.equal((await f.approved()).status, 200);
  assert.equal(
    (await f.service.catalog()).filter((a) => a.kind === 'release').length,
    1,
  );
  const c = await f.connect(),
    instance = (await f.service.overview(buyer)).instances[0];
  assert.equal(instance.active.agentId, c.payload.pin.agentId);
  const input = {
    id: randomUUID(),
    action: 'run',
    connectionId: c.id,
    prompt: 'Make a test result',
  };
  const queued = await f.enqueue(input);
  assert.equal((await f.enqueue(input)).id, queued.id);
  await assert.rejects(f.enqueue({ ...input, prompt: 'different' }), {
    status: 409,
  });
  const { command: r } = await f.poll();
  await f.service.start(buyer, credential, {
    ...f.base,
    id: r.id,
    lease: r.lease,
  });
  await assert.rejects(
    f.service.start(buyer, credential, { ...f.base, id: r.id, lease: r.lease }),
    { status: 409 },
  );
  await f.finish(r, { state: 'succeeded', result: outcome, calls: 0 });
  const job = await f.jobs.get(buyer, r.id);
  assert.equal(job.noahExecution.state, 'returned');
  assert.deepEqual(job.noahExecution.result, outcome);
  assert.equal(await f.jobs.get('author-fixture', r.id), null);
  assert.deepEqual((await f.service.overview('other')).commands, []);
  await assert.rejects(f.service.stop('other', c.id), { status: 404 });
  await f.service.stop(buyer, c.id);
  assert.deepEqual((await f.poll()).disconnect, [c.id]);
  await f.service.disconnected(buyer, credential, { ...f.base, id: c.id });
  assert.equal(
    (await f.service.overview(buyer)).commands.find((x) => x.id === c.id).state,
    'cancelled',
  );
  await assert.rejects(
    f.enqueue({ action: 'run', connectionId: c.id, prompt: 'late' }),
    { status: 409 },
  );
});

void test('one lease wins; running cancellation is requested before acknowledged; no late success', async (t) => {
  const f = await launchFixture(t);
  await f.approved();
  const c = await f.connect();
  await f.enqueue({ action: 'run', connectionId: c.id, prompt: 'long job' });
  const polls = await Promise.all([f.poll(), f.poll()]);
  assert.equal(polls.filter((p) => p.command).length, 1);
  const r = polls.find((p) => p.command).command;
  await f.service.start(buyer, credential, {
    ...f.base,
    id: r.id,
    lease: r.lease,
  });
  await f.service.stop(buyer, c.id);
  assert.equal(
    (
      await f.service.heartbeat(buyer, credential, {
        ...f.base,
        id: r.id,
        lease: r.lease,
      })
    ).stop,
    true,
  );
  await assert.rejects(
    f.service.disconnected(buyer, credential, { ...f.base, id: c.id }),
    { status: 409 },
  );
  await assert.rejects(
    f.finish(r, { state: 'succeeded', result: outcome, calls: 0 }),
    { status: 409 },
  );
  await f.finish(r, { state: 'cancelled', calls: 0 });
  await f.service.disconnected(buyer, credential, { ...f.base, id: c.id });
  assert.equal(
    (await f.jobs.get(buyer, r.id)).noahExecution.state,
    'cancelled',
  );
});

void test('lease expiry makes Work unknown, never redelivers, and new boot cannot reuse an old connection', async (t) => {
  const f = await launchFixture(t);
  await f.approved();
  const c = await f.connect();
  await f.enqueue({
    action: 'run',
    connectionId: c.id,
    prompt: 'lost response',
  });
  const { command: r } = await f.poll();
  await f.service.start(buyer, credential, {
    ...f.base,
    id: r.id,
    lease: r.lease,
  });
  f.advance(31000);
  assert.equal(
    (await f.service.overview(buyer)).commands.find((x) => x.id === r.id).state,
    'unknown',
  );
  assert.equal((await f.jobs.get(buyer, r.id)).noahExecution.state, 'unknown');
  assert.equal((await f.poll()).command, null);
  await assert.rejects(
    f.finish(r, { state: 'succeeded', result: outcome, calls: 0 }),
    { status: 409 },
  );
  await f.service.enroll(buyer, credential, {
    bootId: randomUUID(),
    name: 'restarted',
    platform: 'darwin-arm64',
  });
  assert.equal(
    (await f.service.overview(buyer)).commands.find((x) => x.id === c.id)
      .currentBoot,
    false,
  );
  await assert.rejects(
    f.enqueue({ action: 'run', connectionId: c.id, prompt: 'old connection' }),
    { status: 409 },
  );
  await assert.rejects(f.poll(), { status: 403 });
});

void test('review revocation and device revocation fence execution; auth, Origin and owner scope are enforced', async (t) => {
  const f = await launchFixture(t);
  await f.approved();
  const c = await f.connect();
  f.revoke();
  await assert.rejects(
    f.enqueue({ action: 'run', connectionId: c.id, prompt: 'revoked' }),
    { status: 409 },
  );
  assert.deepEqual((await f.poll()).disconnect, [c.id]);
  const input = {
    action: 'connect',
    id: randomUUID(),
    agentId: c.payload.pin.agentId,
    deviceId: f.base.deviceId,
  };
  const request = await f.post(buyer, input, '/api/noah/launch');
  request.headers.set('Origin', 'https://wrong.example');
  assert.equal((await f.api(request)).status, 403);
  const foreign = await f.post(buyer, input, '/api/noah/launch');
  foreign.headers.set('X-Rock-Owner-Scope', await ownerScopeFor('other'));
  assert.equal((await f.api(foreign)).status, 409);
  assert.equal(
    (await f.api(new Request(origin + '/api/noah/launch'))).status,
    401,
  );
  const cookieRunner = await f.post(
    buyer,
    { action: 'poll', ...f.base },
    '/api/noah/runner',
  );
  assert.equal((await f.api(cookieRunner, true)).status, 403);
  await f.service.revoke(buyer, f.base.deviceId);
  await assert.rejects(f.poll(), { status: 403 });
  await assert.rejects(
    f.service.enroll(buyer, credential, {
      bootId: randomUUID(),
      name: 'revoked reuse',
      platform: 'darwin-arm64',
    }),
    { status: 409 },
  );
});
