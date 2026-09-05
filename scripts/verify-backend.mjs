import assert from 'node:assert/strict';
const site = process.argv[2] || 'http://127.0.0.1:3011';
const origin = new URL(site);
if (
  !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname) ||
  origin.protocol !== 'http:'
)
  throw new Error('Local verification only');
const user = 'loop-backend-test-' + crypto.randomUUID(),
  other = user + '-other';
const headers = {
  Origin: site,
  'Content-Type': 'application/json',
  'oai-authenticated-user-id': user,
};
const request = async (path, method = 'GET', body, extra = {}) => {
  const r = await fetch(site + path, {
    method,
    headers: { ...headers, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  return { status: r.status, data };
};
assert.equal((await fetch(site + '/api/operations')).status, 401);
assert.equal(
  (await request('/api/jobs', 'POST', {}, { Origin: 'https://wrong.example' }))
    .status,
  403,
);
assert.equal(
  (await request('/api/jobs', 'POST', {}, { 'Content-Type': 'text/plain' }))
    .status,
  415,
);
assert.equal(
  (await request('/api/jobs', 'POST', { text: 'x'.repeat(5000) })).status,
  413,
);
assert.equal((await request('/api/runs', 'POST', {})).status, 410);
const input = {
  id: crypto.randomUUID(),
  tool: 'mr-citations',
  transport: 'browser',
  sample: true,
  inputBytes: 32,
};
const creates = await Promise.all([
  request('/api/jobs', 'POST', input),
  request('/api/jobs', 'POST', input),
]);
assert.deepEqual(
  creates.map((r) => r.status),
  [200, 200],
  JSON.stringify(creates),
);
assert.equal(
  (await request('/api/jobs', 'POST', { ...input, id: crypto.randomUUID() }))
    .status,
  409,
);
assert.equal(
  (
    await request('/api/jobs/' + input.id, 'GET', undefined, {
      'oai-authenticated-user-id': other,
    })
  ).status,
  404,
);
const starts = await Promise.all([
  request('/api/jobs/' + input.id, 'PATCH', { action: 'start' }),
  request('/api/jobs/' + input.id, 'PATCH', { action: 'start' }),
]);
assert.deepEqual(
  starts.map((r) => r.status).sort(),
  [200, 409],
  JSON.stringify(starts),
);
const finish = {
  action: 'finish',
  status: 'completed',
  durationMs: 100,
  outputBytes: 20,
};
const finishes = await Promise.all([
  request('/api/jobs/' + input.id, 'PATCH', finish),
  request('/api/jobs/' + input.id, 'PATCH', finish),
]);
assert.deepEqual(
  finishes.map((r) => r.status),
  [200, 200],
  JSON.stringify(finishes),
);
assert.equal((await request('/api/fund')).data.totalRuns, 1);
assert.equal(
  (
    await request('/api/jobs/' + input.id, 'PATCH', {
      ...finish,
      status: 'failed',
    })
  ).status,
  409,
);
assert.equal(
  (
    await request('/api/tool-controls', 'PUT', {
      tool: 'mr-citations',
      enabled: false,
    })
  ).status,
  200,
);
assert.equal(
  (await request('/api/jobs', 'POST', { ...input, id: crypto.randomUUID() }))
    .status,
  409,
);
assert.equal(
  (
    await request('/api/tool-controls', 'PUT', {
      tool: 'mr-citations',
      enabled: true,
    })
  ).status,
  200,
);
const device = crypto.randomUUID();
assert.equal(
  (
    await request('/api/devices', 'POST', {
      id: device,
      name: '検証用PC',
      action: 'connect',
    })
  ).status,
  200,
);
assert.equal(
  (
    await request(
      '/api/devices',
      'POST',
      { id: device, action: 'revoke' },
      { 'oai-authenticated-user-id': other },
    )
  ).status,
  409,
);
assert.equal(
  (await request('/api/devices', 'POST', { id: device, action: 'revoke' }))
    .status,
  200,
);
assert.equal(
  (await request('/api/devices', 'POST', { id: device, action: 'heartbeat' }))
    .status,
  409,
);
const entry = {
  id: crypto.randomUUID(),
  kind: 'revenue',
  amount: 130000,
  source: 'coconala',
  occurredOn: '2026-09-04',
};
assert.equal((await request('/api/book', 'POST', entry)).status, 200);
assert.equal((await request('/api/book', 'POST', entry)).status, 200);
assert.equal(
  (await request('/api/book', 'POST', { ...entry, amount: 123 })).status,
  409,
);
const reverse = { id: crypto.randomUUID(), reversesId: entry.id };
assert.equal((await request('/api/book', 'POST', reverse)).status, 200);
assert.equal((await request('/api/book', 'POST', reverse)).status, 200);
assert.equal(
  (await request('/api/book', 'POST', { ...reverse, id: crypto.randomUUID() }))
    .status,
  409,
);
const overview = (await request('/api/operations')).data;
assert.equal(overview.book.revenue, 0);
assert.equal(overview.book.records.length, 2);
assert.equal(overview.usage.processedBytes, 52);
assert.equal(overview.book.verified, false);
assert.equal(overview.usage.electricityWh, null);
const foreign = (
  await request('/api/operations', 'GET', undefined, {
    'oai-authenticated-user-id': other,
  })
).data;
assert.equal(foreign.jobs.length, 0);
assert.equal(foreign.devices.length, 0);
assert.equal(foreign.book.records.length, 0);
console.log(
  'PASS: Worker/D1 auth, Origin, request limits, concurrent idempotency, single start, atomic completion, user isolation, tool controls, device revocation, reversible book records. Synthetic local users only.',
);
