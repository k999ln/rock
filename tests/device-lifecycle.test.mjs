import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Bundle both real coordinators together so their device module state is shared.
// All MCP/API requests, browser storage and interval triggers stay in memory.
const built = await build({
  stdin: {
    contents: `export * from ${JSON.stringify(new URL('../lib/device.ts', import.meta.url).pathname)};
      export * from ${JSON.stringify(new URL('../lib/operations-client.ts', import.meta.url).pathname)};`,
    resolveDir: new URL('..', import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
});
const source = Buffer.from(built.outputFiles[0].text).toString('base64');
const token = 'SYNTHETIC-TEST-TOKEN-XXXXXXXXXXXXXXXXXXXXXXXX';
const oldId = '11111111-1111-4111-8111-111111111111';
const json = (value, status = 200) => Response.json(value, { status });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const settle = () => new Promise((done) => setImmediate(done));
let sequence = 0;

async function harness(t) {
  const device = await import(
    `data:text/javascript;base64,${source}#${sequence++}`
  );
  const saved = Object.fromEntries(
    ['fetch', 'window', 'sessionStorage', 'setInterval', 'clearInterval'].map(
      (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)],
    ),
  );
  const storage = new Map();
  const requests = [];
  const intervals = new Map();
  const events = [];
  let intervalId = 0;
  const state = {
    device,
    storage,
    requests,
    intervals,
    events,
    handle: null,
    cleanup: [],
  };
  globalThis.window = new EventTarget();
  for (const name of ['loop-device', 'loop-run-state']) {
    window.addEventListener(name, (event) =>
      events.push({ name, detail: event.detail }),
    );
  }
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  globalThis.setInterval = (callback, delay) => {
    const id = ++intervalId;
    intervals.set(id, { callback, delay });
    return id;
  };
  globalThis.clearInterval = (id) => intervals.delete(id);
  globalThis.fetch = async (path, init) => {
    const request = {
      path,
      body: JSON.parse(init.body),
      headers: Object.fromEntries(new Headers(init.headers)),
    };
    requests.push(request);
    const overridden = await state.handle?.(request);
    if (overridden !== undefined) return overridden;
    if (path === '/api/devices') return json({});
    if (path === '/api/jobs')
      return json({ id: request.body.id, status: 'queued' });
    if (path.startsWith('/api/jobs/')) return json({ status: 'running' });
    assert.ok(
      path.startsWith(device.DEVICE_URL + '/'),
      'Only known loopback MCP requests are permitted',
    );
    if (path.endsWith('/connect')) return json({ token });
    switch (request.body.method) {
      case 'initialize':
        return json({ result: { protocolVersion: '2025-11-25' } });
      case 'notifications/initialized':
        return new Response(null, { status: 202 });
      case 'tools/list':
        return json({
          result: {
            tools: [
              { name: 'coconala_check' },
              { name: 'format_citations' },
              { name: 'make_free_article' },
              { name: 'verify_delivery' },
              { name: 'future_optional_tool' },
            ],
          },
        });
      case 'ping':
        return json({ result: {} });
      case 'tools/call':
        return json({
          result: { structuredContent: { output: 'accepted', status: 'PASS' } },
        });
      default:
        assert.fail('Unexpected MCP method: ' + request.body.method);
    }
  };
  state.seed = (id = oldId) => {
    storage.set('loop.device.session', token);
    storage.set('loop.device.id', id);
  };
  state.tick = async () => {
    for (const { callback } of intervals.values()) callback();
    await settle();
  };
  state.tracked = () =>
    device.executeTracked({
      tool: 'mr-citations',
      transport: 'local-mcp',
      sample: false,
      inputBytes: 12,
      task: () =>
        device.runDevice('check_citations', { text: 'synthetic test input' }),
    });
  t.after(async () => {
    for (const cleanup of state.cleanup) cleanup();
    await settle();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return state;
}

await test('one explicit reconnect uses a fresh identity and delayed disconnect cannot target its replacement', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ path, body }) => {
    if (
      path === '/api/devices' &&
      body.action === 'connect' &&
      body.id === oldId
    )
      return json({}, 409);
    if (path === '/api/devices' && body.action === 'disconnect')
      return pending.promise;
  };
  await h.device.connectDevice();
  const connectedId = h.device.deviceId();
  assert.notEqual(connectedId, oldId);
  h.device.disconnectDevice();
  const disconnect = h.requests.find(
    ({ body }) => body.action === 'disconnect',
  );
  assert.equal(disconnect.body.id, connectedId);
  assert.equal(h.storage.has('loop.device.id'), false);
  assert.equal(h.device.deviceToken(), '');
  await h.device.connectDevice();
  const replacement = h.device.deviceId();
  assert.notEqual(replacement, connectedId);
  pending.resolve(json({}));
  await settle();
  assert.equal(h.device.deviceId(), replacement);
  assert.equal(h.device.deviceToken(), token);
  assert.equal(disconnect.body.id, connectedId);
  assert.equal(
    h.requests.filter(({ body }) => body.action === 'connect').length,
    2,
  );
});

await test('PC connection accepts extra tools and keeps the negotiated protocol', async (t) => {
  const h = await harness(t);
  h.handle = ({ body }) =>
    body.method === 'initialize'
      ? json({ result: { protocolVersion: '2025-06-18' } })
      : undefined;
  await h.device.connectDevice();
  assert.equal(h.device.deviceProtocol(), '2025-06-18');
  await h.device.runDevice('format_citations', { text: 'synthetic' });
  const called = h.requests.find(({ body }) => body.method === 'tools/call');
  assert.equal(called.headers['mcp-protocol-version'], '2025-06-18');
});

await test('PC connection rejects an outdated pack missing a required tool', async (t) => {
  const h = await harness(t);
  h.handle = ({ body }) =>
    body.method === 'tools/list'
      ? json({ result: { tools: [{ name: 'coconala_check' }] } })
      : undefined;
  await assert.rejects(
    h.device.connectDevice(),
    /PC接続アプリを更新してください/,
  );
});

await test('failed server connection registration removes credentials and cannot dispatch a local tool', async (t) => {
  const h = await harness(t);
  h.handle = ({ path }) =>
    path === '/api/devices' ? json({}, 409) : undefined;
  await assert.rejects(h.device.connectDevice());
  assert.equal(h.storage.has('loop.device.id'), false);
  assert.equal(h.device.deviceToken(), '');
  await assert.rejects(h.tracked());
  assert.equal(
    h.requests.some(({ body }) => body.method === 'tools/call'),
    false,
  );
  assert.equal(
    h.requests.some(({ path }) => path === '/api/jobs'),
    false,
  );
});

await test('automatic verification shares one ping and heartbeat without changing identity', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ body }) =>
    body.method === 'ping' ? pending.promise : undefined;
  const first = h.device.verifyDevice();
  const second = h.device.verifyDevice();
  assert.equal(first, second);
  assert.equal(
    h.requests.filter(({ body }) => body.method === 'ping').length,
    1,
  );
  pending.resolve(json({ result: {} }));
  await Promise.all([first, second]);
  const heartbeats = h.requests.filter(
    ({ body }) => body.action === 'heartbeat',
  );
  assert.equal(heartbeats.length, 1);
  assert.equal(heartbeats[0].body.id, oldId);
  assert.equal(h.device.deviceId(), oldId);
});

await test('monitor checks on start, 30-second interval and online, pauses during a local call, and cleans up', async (t) => {
  const h = await harness(t);
  h.seed();
  const stop = h.device.monitorDevice();
  h.cleanup.push(stop);
  await settle();
  assert.deepEqual(
    [...h.intervals.values()].map(({ delay }) => delay),
    [30000],
  );
  const heartbeats = () =>
    h.requests.filter(({ body }) => body.action === 'heartbeat').length;
  assert.equal(heartbeats(), 1);
  await h.tick();
  assert.equal(heartbeats(), 2);
  window.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(heartbeats(), 3);
  const pending = deferred();
  h.handle = ({ body }) =>
    body.method === 'tools/call' ? pending.promise : undefined;
  const running = h.device.runDevice('check_citations', {});
  await h.tick();
  window.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(heartbeats(), 3);
  pending.resolve(json({ result: { structuredContent: { output: 'done' } } }));
  await running;
  await h.tick();
  assert.equal(heartbeats(), 4);
  stop();
  assert.equal(h.intervals.size, 0);
  window.dispatchEvent(new Event('online'));
  await settle();
  assert.equal(heartbeats(), 4);
});

await test('monitor heartbeat revocation clears credentials and blocks the next local dispatch', async (t) => {
  const h = await harness(t);
  h.seed();
  h.handle = ({ body }) =>
    body.action === 'heartbeat' ? json({}, 409) : undefined;
  const stop = h.device.monitorDevice();
  h.cleanup.push(stop);
  await settle();
  assert.equal(h.device.deviceToken(), '');
  assert.equal(h.storage.has('loop.device.id'), false);
  assert.ok(h.events.some(({ name }) => name === 'loop-device'));
  assert.equal(
    h.requests.find(({ body }) => body.action === 'disconnect').body.id,
    oldId,
  );
  await assert.rejects(h.tracked());
  assert.equal(
    h.requests.some(({ body }) => body.method === 'tools/call'),
    false,
  );
  assert.equal(
    h.requests.some(({ path }) => path === '/api/jobs'),
    false,
  );
});

for (const revokedAt of ['heartbeat', 'admission', 'start']) {
  await test(`server rejection at ${revokedAt} never dispatches the local tool`, async (t) => {
    const h = await harness(t);
    h.seed();
    h.handle = ({ path, body }) => {
      if (
        (revokedAt === 'heartbeat' && body.action === 'heartbeat') ||
        (revokedAt === 'admission' && path === '/api/jobs') ||
        (revokedAt === 'start' && body.action === 'start')
      )
        return json({ error: 'revoked' }, 409);
    };
    await assert.rejects(h.tracked());
    assert.equal(
      h.requests.some(({ body }) => body.method === 'tools/call'),
      false,
    );
    assert.equal(
      h.requests.some(({ body }) => body.action === 'finish'),
      false,
    );
    assert.equal(
      h.events.filter(({ name }) => name === 'loop-run-state').at(-1).detail,
      '',
    );
    assert.equal(
      h.requests.filter(({ path }) => path === '/api/jobs').length,
      revokedAt === 'heartbeat' ? 0 : 1,
    );
    assert.equal(
      h.requests.filter(({ body }) => body.action === 'start').length,
      revokedAt === 'start' ? 1 : 0,
    );
  });
}

await test('successful local execution waits for heartbeat acknowledgement and claims start before one MCP dispatch', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ body }) =>
    body.action === 'heartbeat' ? pending.promise : undefined;
  const running = h.tracked();
  await settle();
  assert.equal(
    h.requests.some(({ path }) => path === '/api/jobs'),
    false,
  );
  assert.equal(
    h.requests.some(({ body }) => body.method === 'tools/call'),
    false,
  );
  pending.resolve(json({}));
  const result = await running;
  assert.equal(result.result.output, 'accepted');
  assert.equal(result.warning, '');
  assert.deepEqual(
    h.requests.map(({ path, body }) =>
      path === '/api/jobs' ? 'admission' : body.method || body.action,
    ),
    ['ping', 'heartbeat', 'admission', 'start', 'tools/call', 'finish'],
  );
  assert.equal(
    h.requests.find(({ path }) => path === '/api/jobs').body.deviceId,
    oldId,
  );
  assert.equal(
    h.requests.find(({ body }) => body.method === 'tools/call').headers
      .authorization,
    'Bearer ' + token,
  );
});

for (const phase of ['ping', 'heartbeat']) {
  await test(`stale ${phase} failure cannot disconnect a successful replacement connection`, async (t) => {
    const h = await harness(t);
    h.seed();
    const pending = deferred();
    h.handle = ({ body }) =>
      body.method === phase || body.action === phase
        ? pending.promise
        : undefined;
    const verification = h.device.verifyDevice();
    const rejected = assert.rejects(verification);
    await settle();
    await h.device.connectDevice();
    const replacement = h.device.deviceId();
    pending.resolve(json({}, 503));
    await rejected;
    assert.equal(h.device.deviceToken(), token);
    assert.equal(h.storage.get('loop.device.id'), replacement);
    assert.equal(
      h.requests.some(
        ({ body }) => body.action === 'disconnect' && body.id === replacement,
      ),
      false,
    );
  });
}

await test('stale successful ping cannot heartbeat or authorize a replacement session', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ body }) =>
    body.method === 'ping' ? pending.promise : undefined;
  const verification = h.device.verifyDevice();
  const rejected = assert.rejects(verification);
  await h.device.connectDevice();
  const replacement = h.device.deviceId();
  pending.resolve(json({ result: {} }));
  await rejected;
  assert.equal(h.device.deviceToken(), token);
  assert.equal(h.storage.get('loop.device.id'), replacement);
  assert.equal(
    h.requests.some(({ body }) => body.action === 'heartbeat'),
    false,
  );
});

await test('finishing an old verification cannot replace or clear the new session single-flight verification', async (t) => {
  const h = await harness(t);
  h.seed();
  const oldPing = deferred();
  const newPing = deferred();
  let pings = 0;
  h.handle = ({ body }) =>
    body.method === 'ping'
      ? ++pings === 1
        ? oldPing.promise
        : newPing.promise
      : undefined;
  const oldVerification = h.device.verifyDevice();
  const rejected = assert.rejects(oldVerification);
  await h.device.connectDevice();
  const replacement = h.device.deviceId();
  const newVerification = h.device.verifyDevice();
  assert.notEqual(newVerification, oldVerification);
  oldPing.resolve(json({}, 503));
  await rejected;
  assert.equal(h.device.verifyDevice(), newVerification);
  assert.equal(pings, 2);
  newPing.resolve(json({ result: {} }));
  await newVerification;
  assert.equal(
    h.requests.filter(({ body }) => body.action === 'heartbeat').length,
    1,
  );
  assert.equal(
    h.requests.find(({ body }) => body.action === 'heartbeat').body.id,
    replacement,
  );
});

await test('failure of a local call from the old session cannot disconnect a replacement connection', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ body }) =>
    body.method === 'tools/call' ? pending.promise : undefined;
  const running = h.device.runDevice('check_citations', {});
  const rejected = assert.rejects(running);
  await h.device.connectDevice();
  const replacement = h.device.deviceId();
  pending.resolve(json({}, 503));
  await rejected;
  assert.equal(h.device.deviceToken(), token);
  assert.equal(h.storage.get('loop.device.id'), replacement);
  assert.equal(
    h.requests.some(
      ({ body }) => body.action === 'disconnect' && body.id === replacement,
    ),
    false,
  );
});

await test('explicit disconnect during a pending reconnect cannot be undone by its late handshake', async (t) => {
  const h = await harness(t);
  h.seed();
  const pending = deferred();
  h.handle = ({ path }) =>
    path.endsWith('/connect') ? pending.promise : undefined;
  const connecting = h.device.connectDevice();
  const rejected = assert.rejects(connecting);
  h.device.disconnectDevice();
  pending.resolve(json({ token }));
  await rejected;
  assert.equal(h.device.deviceToken(), '');
  assert.equal(h.storage.has('loop.device.id'), false);
  assert.equal(
    h.requests.some(({ body }) => body.action === 'connect'),
    false,
  );
});

for (const phase of ['admission', 'start']) {
  await test(`reconnection during pending ${phase} cannot dispatch under replacement credentials`, async (t) => {
    const h = await harness(t);
    h.seed();
    const pending = deferred();
    h.handle = ({ path, body }) => {
      if (
        (phase === 'admission' && path === '/api/jobs') ||
        (phase === 'start' && body.action === 'start')
      )
        return pending.promise;
    };
    const running = h.tracked();
    const rejected = assert.rejects(running);
    await settle();
    const admission = h.requests.find(({ path }) => path === '/api/jobs');
    assert.equal(admission.body.deviceId, oldId);
    await h.device.connectDevice();
    const replacement = h.device.deviceId();
    pending.resolve(json({ id: admission.body.id, status: 'running' }));
    await rejected;
    assert.equal(h.device.deviceToken(), token);
    assert.equal(h.storage.get('loop.device.id'), replacement);
    assert.equal(
      h.requests.some(({ body }) => body.method === 'tools/call'),
      false,
    );
    assert.equal(
      h.requests.find(({ body }) => body.action === 'finish').body.status,
      'failed',
    );
  });
}
