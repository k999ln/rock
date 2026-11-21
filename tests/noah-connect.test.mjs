import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteFixture } from './helpers/noah-remote-fixture.mjs';
void test('connection replay and concurrent connects produce one live connection and one handshake', async (t) => {
  const f = await remoteFixture(t),
    plan = (
      await f.request('plan', null, {
        query: '?agent=' + encodeURIComponent(f.family),
      })
    ).data;
  const initial = f.requests.filter(
    (r) => r.body?.method === 'initialize',
  ).length;
  const body = {
    id: crypto.randomUUID(),
    agentId: f.family,
    planSha256: plan.planSha256,
  };
  const responses = await Promise.all([
    f.request('connect', body),
    f.request('connect', body),
    f.request('connect', { ...body, id: crypto.randomUUID() }),
  ]);
  assert.ok(responses.every((r) => r.status === 200));
  assert.equal(new Set(responses.map((r) => r.data.id)).size, 1);
  assert.equal(
    f.requests.filter((r) => r.body?.method === 'initialize').length - initial,
    1,
  );
  assert.equal(f.calls().length, 0);
  assert.equal(
    (await f.request('connect', { ...body, planSha256: 'a'.repeat(64) }))
      .status,
    409,
  );
  assert.equal(
    (await f.request('connect', body, { owner: 'bob' })).status,
    404,
  );
});
void test('stale plan, closed flags and connection limits stop before provider traffic', async (t) => {
  const f = await remoteFixture(t),
    plan = (
      await f.request('plan', null, {
        query: '?agent=' + encodeURIComponent(f.family),
      })
    ).data;
  const body = {
      id: crypto.randomUUID(),
      agentId: f.family,
      planSha256: plan.planSha256,
    },
    initial = f.requests.length;
  assert.equal(
    (await f.request('connect', { ...body, planSha256: 'a'.repeat(64) }))
      .status,
    409,
  );
  f.deps.flags.askForm = false;
  assert.equal((await f.request('connect', body)).status, 503);
  f.deps.flags.askForm = true;
  f.deps.flags.askLimits.connectLive = 0;
  assert.equal((await f.request('connect', body)).status, 409);
  assert.equal(f.requests.length, initial);
});
void test('disconnect during an outbound call never saves its late result', async (t) => {
  const f = await remoteFixture(t),
    c = await f.connect(),
    menu = (await f.request('tools', null, { id: c.id })).data.tools;
  let release;
  f.state.callHook = () =>
    new Promise((r) => {
      release = r;
    });
  const id = crypto.randomUUID();
  await f.request('ask', {
    id,
    connectionId: c.id,
    form: { tool: 'read', toolSha256: menu[0].sha256, input: {} },
  });
  for (let i = 0; i < 20 && !release; i++) await new Promise(setImmediate);
  const current = (await f.request('connect', null, { id: c.id })).data;
  assert.equal(
    (
      await f.request(
        'connect',
        { action: 'disconnect', revision: current.revision },
        { id: c.id },
      )
    ).status,
    200,
  );
  release();
  await f.drain();
  const finished = (await f.request('ask', null, { id })).data;
  assert.equal(finished.state, 'stopped');
  assert.equal(finished.result, undefined);
  const work = await f.works.get('alice', id);
  assert.equal(work.noahRemote.state, 'cancelled');
  assert.equal(work.noahRemote.result, undefined);
});
