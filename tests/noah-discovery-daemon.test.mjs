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
  assert.equal(statuses[0].state, 'checked');
  // 取り込みの巡回（公式台帳）も、同じ間隔で、同じ本人の意図と Origin を付けて、空の本文で進める。
  assert.equal(calls.length, 3);
  assert.equal(calls[2].url, 'http://127.0.0.1:3107/api/noah/intake');
  assert.equal(calls[2].init.headers.Origin, 'http://127.0.0.1:3107');
  assert.equal(calls[2].init.headers['X-Rock-Owner-Scope'], scope);
  assert.equal(calls[2].init.redirect, 'manual');
  assert.equal(calls[2].init.body, '{}');
  assert.equal(timers.length, 0, '取り込みが終わるまで、次の予定を入れない（重ならない）');
  release(
    Response.json({
      ownerScope: scope,
      outcomes: [{ source: 'mcp-registry', pages: 1 }],
    }),
  );
  await flush();
  assert.equal(timers[0].ms, 60000);
  assert.deepEqual(
    statuses.map((s) => s.state),
    ['checked', 'intake_checked'],
  );
  daemon.close();
  await timers[0].f();
  assert.equal(calls.length, 3);
});
void test('intake patrol being closed, refused or broken never changes the discovery result', async () => {
  for (const [variant, expected] of [
    ['disabled', 'intake_disabled'],
    ['forbidden', 'intake_unavailable'],
    ['changed', 'intake_unavailable'],
    ['throws', 'intake_unavailable'],
  ]) {
    const statuses = [];
    const d = startDiscoveryDaemon({
      origin: 'http://localhost:3107',
      setTimer: () => 1,
      clearTimer: () => {},
      onStatus: (s) => statuses.push(s),
      fetcher: async (url, init) => {
        if (!init.method) return Response.json({ ownerScope: scope });
        if (!url.endsWith('/api/noah/intake'))
          return Response.json({ ownerScope: scope, outcomes: {} });
        if (variant === 'throws') throw Error('network');
        if (variant === 'forbidden')
          return Response.json({ error: 'no' }, { status: 403 });
        return Response.json({
          ownerScope: variant === 'changed' ? 'owner-v1:' + 'b'.repeat(64) : scope,
          disabled: true,
        });
      },
    });
    await flush();
    await flush();
    d.close();
    assert.deepEqual(
      statuses.map((s) => s.state),
      ['checked', expected],
      variant,
    );
  }
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
