import test from 'node:test';
import assert from 'node:assert/strict';
import { McpHub } from '../toolkits/sky-mcp-connector/server.mjs';

async function fixture() {
  const hub = new McpHub([{ id: 'fixture', name: 'Fixture', transport: 'stdio', command: 'unused', args: [] }]);
  let variant = 'original', calls = 0, reads = 0;
  const entry = hub.entry('fixture');
  entry.transport = { protocol: null, reset() {}, close() {}, async request(message) {
    if (!('id' in message)) return null;
    let result;
    if (message.method === 'initialize') result = { protocolVersion: '2025-11-25', serverInfo: { name: 'fixture', version: '1' } };
    else if (message.method === 'tools/list') {
      reads++;
      if (variant === 'error') throw new Error('synthetic observation failure');
      result = { tools: [{ name: 'count', inputSchema: { type: 'object', ...(variant === 'changed' ? { properties: { changed: { type: 'string' } } } : {}) },
        outputSchema: { type: 'object' }, _meta: { 'rockstaros.dev/pricing': { model: 'free', note: 'fixture' } } }] };
    } else { calls++; result = { content: [{ type: 'text', text: 'fixture' }] }; }
    return { jsonrpc: '2.0', id: message.id, result };
  } };
  await hub.connect('fixture');
  return { hub, entry, set(value) { variant = value; }, calls: () => calls, reads: () => reads };
}

void test('cached expiration blocks old prepare and fresh observation renews without restarting transport', async () => {
  const f = await fixture();
  f.entry.passport.observedAt = Date.now() - 31_000; f.entry.passport.observationExpiresAt = Date.now() - 1;
  assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  await f.hub.refresh('fixture');
  const approval = f.hub.prepare('fixture', 'count', {});
  await f.hub.execute('fixture', 'count', {}, approval.approvalToken, true);
  assert.equal(f.calls(), 1); assert.equal(f.reads(), 3); f.hub.close();
});

void test('changed or unavailable declaration blocks before claim and consumes no Tool call', async () => {
  for (const variant of ['changed', 'error']) {
    const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {}); let claims = 0;
    f.set(variant);
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true, async () => { claims++; }));
    assert.equal(claims, 0); assert.equal(f.calls(), 0); assert.equal(f.entry.passport, null);
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true));
    f.hub.close();
  }
});

void test('expiry or a newer observation during the claim blocks the call without repeating it', async () => {
  for (const mode of ['expiry', 'newer']) {
    const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {}); let claims = 0;
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true, async () => {
      claims++;
      if (mode === 'expiry') f.entry.passport.observationExpiresAt = Date.now() - 1;
      else await f.hub.refresh('fixture');
    }), { code: 'approval_mismatch' });
    assert.equal(claims, 1); assert.equal(f.calls(), 0);
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true));
    assert.equal(claims, 1); f.hub.close();
  }
});

void test('refresh never starts a new stdio process after the connected process is gone', async () => {
  const hub = new McpHub([{ id: 'fixture', name: 'Fixture', transport: 'stdio', command: 'must-not-start', args: [] }]);
  const entry = hub.entry('fixture'); entry.connectionAttempt = Symbol('old session'); entry.state = 'connected';
  entry.passport = { tools: [], toolDigest: 'a'.repeat(64), observedAt: Date.now(), observationExpiresAt: Date.now() + 29_000 };
  await assert.rejects(hub.refresh('fixture'), { code: 'observation_superseded' });
  assert.equal(entry.transport.process, null); assert.equal(entry.passport, null); hub.close();
});

void test('overlapping observations cannot revive a superseded snapshot', async () => {
  const f = await fixture(); const transport = f.entry.transport, original = transport.request;
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let delayed = false;
  transport.request = async message => {
    if (message.method === 'tools/list' && !delayed) { delayed = true; entered(); await blocked; }
    return original(message);
  };
  const first = f.hub.refresh('fixture'); await enteredPromise;
  const second = await f.hub.refresh('fixture'); release();
  await assert.rejects(first, { code: 'observation_superseded' });
  assert.equal(f.entry.passport, second); assert.equal(f.entry.state, 'connected');
  assert.equal(f.calls(), 0); f.hub.close();
});

void test('approval expiring during observation cannot reach claim or Tool', async () => {
  const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {});
  const original = f.entry.transport.request;
  f.entry.transport.request = async message => {
    const result = await original(message);
    if (message.method === 'tools/list') f.hub.approvals.get(approval.approvalToken.split('.')[0]).expiresAt = Date.now() - 1;
    return result;
  };
  let claims = 0;
  await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true, async () => { claims++; }), { code: 'tool_observation_expired' });
  assert.equal(claims, 0); assert.equal(f.calls(), 0); f.hub.close();
});

void test('wall-clock rollback and expiry permanently invalidate an observation until a fresh read', async t => {
  let clock = 1_000; t.mock.method(Date, 'now', () => clock);
  const f = await fixture();
  assert.ok(f.hub.prepare('fixture', 'count', {}));
  clock = 3_000; assert.ok(f.hub.prepare('fixture', 'count', {}));
  clock = 2_000; assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  clock = 4_000; assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  await f.hub.refresh('fixture'); assert.ok(f.hub.prepare('fixture', 'count', {}));
  clock = 34_000; assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  clock = 5_000; assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  f.hub.close();
});

void test('expired approval cannot revive after clock rollback or refresh', async t => {
  let clock = 1_000; t.mock.method(Date, 'now', () => clock);
  const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {});
  clock = 301_000;
  await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true), { code: 'invalid_approval' });
  clock = 2_000; await f.hub.refresh('fixture');
  await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true), { code: 'invalid_approval' });
  assert.equal(f.calls(), 0); f.hub.close();
});

void test('clock rollback during observation or claim blocks execution and cannot retry the claim', async t => {
  for (const stage of ['observation', 'claim']) {
    let clock = 1_000; const mocked = t.mock.method(Date, 'now', () => clock);
    const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {}); let claims = 0;
    const original = f.entry.transport.request;
    f.entry.transport.request = async message => { const value = await original(message);
      if (stage === 'observation' && message.method === 'tools/list') clock = 2_000;
      return value;
    };
    clock = 3_000;
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true, async () => { claims++; clock = 2_000; }));
    assert.equal(claims, stage === 'claim' ? 1 : 0); assert.equal(f.calls(), 0);
    clock = 4_000;
    await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true));
    assert.equal(f.calls(), 0); f.hub.close(); mocked.mock.restore();
  }
});

void test('clock rollback seen by a different operation also revokes the old approval', async t => {
  let clock = 1_000; t.mock.method(Date, 'now', () => clock);
  const f = await fixture(), approval = f.hub.prepare('fixture', 'count', {});
  clock = 3_000; f.hub.list();
  clock = 2_000; await f.hub.refresh('fixture');
  await assert.rejects(f.hub.execute('fixture', 'count', {}, approval.approvalToken, true), { code: 'invalid_approval' });
  assert.equal(f.calls(), 0); f.hub.close();
});

void test('monotonic deadlines deny observation and approval even if wall time remains unchanged', async () => {
  const f = await fixture(), prepared = f.hub.prepare('fixture', 'count', {});
  f.entry.observationClock.deadline = performance.now() - 1;
  assert.throws(() => f.hub.prepare('fixture', 'count', {}), { code: 'tool_observation_expired' });
  await f.hub.refresh('fixture');
  const nonce = prepared.approvalToken.split('.')[0]; f.hub.approvals.get(nonce).deadline = performance.now() - 1;
  await assert.rejects(f.hub.execute('fixture', 'count', {}, prepared.approvalToken, true), { code: 'invalid_approval' });
  assert.equal(f.calls(), 0); f.hub.close();
});

void test('list never revives an invalidated observation across a consumer reload or clock rollback', async t => {
  let clock = 1_000; t.mock.method(Date, 'now', () => clock);
  const f = await fixture(), initial = f.hub.list()[0].passport;
  assert.ok(initial); clock = 3_000; assert.equal(f.hub.list()[0].passport.observationId, initial.observationId);
  clock = 2_000; assert.equal(f.hub.list()[0].passport, null);
  clock = 4_000; assert.equal(f.hub.list()[0].passport, null); // a reloaded consumer only sees null
  const refreshed = await f.hub.refresh('fixture'); assert.notEqual(refreshed.observationId, initial.observationId);
  assert.equal(f.hub.list()[0].passport.observationId, refreshed.observationId);
  clock = 34_000; assert.equal(f.hub.list()[0].passport, null);
  clock = 5_000; assert.equal(f.hub.list()[0].passport, null);
  f.hub.close();
});

void test('list hides a previous passport while a refresh is in flight', async () => {
  const f = await fixture(), original = f.entry.transport.request;
  let release, entered;
  const waiting = new Promise(resolve => { release = resolve; });
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  f.entry.transport.request = async message => { if (message.method === 'tools/list') { entered(); await waiting; } return original(message); };
  const pending = f.hub.refresh('fixture'); await enteredPromise;
  assert.equal(f.hub.list()[0].passport, null);
  release(); const observed = await pending; assert.equal(f.hub.list()[0].passport.observationId, observed.observationId);
  f.hub.close();
});

void test('a stopped stdio process is never projected as a fresh passport', () => {
  const hub = new McpHub([{ id: 'fixture', name: 'Fixture', transport: 'stdio', command: 'must-not-start', args: [] }]);
  const entry = hub.entry('fixture'), now = Date.now();
  entry.connectionAttempt = Symbol('old session'); entry.state = 'connected';
  entry.passport = { tools: [], toolDigest: 'a'.repeat(64), observationId: crypto.randomUUID(),
    observedAt: now, observationExpiresAt: now + 30_000 };
  hub.rememberObservation(entry);
  assert.equal(entry.transport.process, null);
  const listed = hub.list()[0]; assert.equal(listed.passport, null); assert.equal(listed.toolCount, null);
  assert.equal(entry.observationClock.invalid, true); assert.equal(entry.transport.process, null);
  hub.close();
});

void test('ordinary expiry is per connection, while a clock rollback invalidates both', async t => {
  let clock = 1_000; t.mock.method(Date, 'now', () => clock);
  const hub = new McpHub(['first', 'second'].map(id => ({ id, name: id, transport: 'stdio', command: 'unused', args: [] })));
  for (const id of ['first', 'second']) {
    hub.entry(id).transport = { protocol: null, reset() {}, close() {}, async request(message) {
      if (!('id' in message)) return null;
      const result = message.method === 'initialize'
        ? { protocolVersion: '2025-11-25', serverInfo: { name: id, version: '1' } }
        : { tools: [{ name: 'count', inputSchema: { type: 'object' }, outputSchema: { type: 'object' },
          _meta: { 'rockstaros.dev/pricing': { model: 'free', note: 'fixture' } } }] };
      return { jsonrpc: '2.0', id: message.id, result };
    } };
  }
  await hub.connect('first'); clock = 11_000; await hub.connect('second');
  clock = 31_000;
  let states = hub.list(); assert.equal(states.find(s => s.id === 'first').passport, null);
  assert.ok(states.find(s => s.id === 'second').passport);
  await hub.refresh('first'); states = hub.list(); assert.ok(states.every(s => s.passport));
  clock = 32_000; assert.ok(hub.list().every(s => s.passport));
  clock = 30_000; states = hub.list(); assert.ok(states.every(s => s.passport === null));
  clock = 33_000; assert.ok(hub.list().every(s => s.passport === null));
  hub.close();
});
