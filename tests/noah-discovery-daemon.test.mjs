import assert from 'node:assert/strict';
import test from 'node:test';
import { startDiscoveryDaemon } from '../scripts/noah-discovery-daemon.mjs';
const scope = 'owner-v1:' + 'a'.repeat(64),
  flush = () => new Promise(setImmediate);
void test('daemon schedules independently of a page, sends owner intent and origin and never overlaps', async () => {
  const calls = [],
    statuses = [],
    timers = [];
  let release;
  const daemon = startDiscoveryDaemon({
    origin: 'http://127.0.0.1:3107',
    setTimer: (f, ms) => {
      timers.push({ f, ms });
      return 1;
    },
    clearTimer: () => {},
    onStatus: (s) => statuses.push(s),
    fetcher: async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/intake')) return new Response(null, { status: 404 });
      if (init.method === 'POST') return new Promise((r) => (release = r));
      return Response.json({ ownerScope: scope });
    },
  });
  await flush();
  await daemon.tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers.Origin, 'http://127.0.0.1:3107');
  assert.equal(calls[1].init.headers['X-Rock-Owner-Scope'], scope);
  assert.equal(calls[1].init.redirect, 'manual');
  assert.equal(calls[1].init.body, '{}');
  release(
    Response.json({ ownerScope: scope, outcomes: { github: 'updated' } }),
  );
  await flush();
  assert.equal(timers[0].ms, 60000);
  assert.equal(statuses[0].state, 'checked');
  daemon.close();
  await timers[0].f();
  assert.equal(calls.length, 3);
});
void test('missing owner, redirected reads and changed owner never count as a successful update', async () => {
  for (const variant of ['missing', 'redirect', 'changed']) {
    const statuses = [],
      calls = [];
    const d = startDiscoveryDaemon({
      origin: 'http://localhost:3107',
      setTimer: () => 1,
      clearTimer: () => {},
      onStatus: (s) => statuses.push(s),
      fetcher: async (url, init) => {
        calls.push(init.method);
        return variant === 'redirect'
          ? new Response(null, { status: 302 })
          : Response.json({
              ownerScope:
                variant === 'missing'
                  ? null
                  : init.method
                    ? 'owner-v1:' + 'b'.repeat(64)
                    : scope,
            });
      },
    });
    await flush();
    d.close();
    assert.equal(statuses[0].state, 'unavailable');
    assert.equal(calls.length, variant === 'changed' ? 2 : 1);
  }
});
void test('closing host aborts the outstanding read and cannot start a late mutation', async () => {
  let release,
    signal,
    calls = 0;
  const d = startDiscoveryDaemon({
    origin: 'http://127.0.0.1:3107',
    setTimer: () => {
      throw Error('no late timer');
    },
    fetcher: async (_url, init) => {
      calls++;
      signal = init.signal;
      return new Promise((r) => (release = r));
    },
  });
  d.close();
  assert.equal(signal.aborted, true);
  release(Response.json({ ownerScope: scope }));
  await flush();
  assert.equal(calls, 1);
});
void test('host refuses remote, credentialed, path/query-bearing origins and aggressive polling', () => {
  for (const origin of [
    'https://evil.test',
    'http://evil.test',
    'http://user@localhost',
    'http://localhost/path',
    'http://localhost?secret=1',
  ])
    assert.throws(() => startDiscoveryDaemon({ origin }));
  assert.throws(() =>
    startDiscoveryDaemon({ origin: 'http://localhost', intervalMs: 1000 }),
  );
});
