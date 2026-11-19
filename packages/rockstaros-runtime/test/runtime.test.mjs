import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRockstarRuntime,
  diagnoseHardware,
  reduceEveCommand,
  runtimeContract,
} from '../src/index.mjs';
import { createPrivateLinuxWorkJob } from '../../../lib/workflow.ts';
const jobId = '01234567-1234-4234-8234-0123456789ab';
const commandId = '01234567-1234-4234-8234-0123456789ac';
const token = 'rock_session_' + 'a'.repeat(43);
const observation = (features = {}) => ({
  schema: 'rockstaros.hardware-observation/1',
  deviceId: 'mini-bench',
  platform: 'linux',
  adapterVersion: '1',
  observedAt: 1000,
  expiresAt: 31000,
  evidenceKind: 'synthetic',
  features,
});
function client(fetchImpl, extras = {}) {
  return createRockstarRuntime({
    origin: 'https://avoado.si',
    getSessionToken: async () => token,
    fetchImpl,
    ...extras,
  });
}
const reply = (value) => Response.json(value);

void test('device enrollment opts into owner-device binding without changing legacy request bodies', async () => {
  const seen = [];
  const runtime = client(async (url, init) => {
    seen.push({ path: new URL(url).pathname, headers: new Headers(init.headers), body: init.body && JSON.parse(init.body) });
    return reply({});
  });
  await runtime.connection.begin('Synthetic host');
  await runtime.connection.poll('rock_device_fixture');
  await runtime.eve.list();
  for (const entry of seen.slice(0, 2)) {
    assert.equal(entry.headers.get('X-Rockstar-Device-Binding'), 'owner-device/v1');
    assert.equal(entry.headers.has('authorization'), false);
  }
  assert.deepEqual(seen[0].body, { action: 'begin', deviceName: 'Synthetic host' });
  assert.deepEqual(seen[1].body, { action: 'poll', deviceCode: 'rock_device_fixture' });
  assert.equal(seen[2].headers.has('X-Rockstar-Device-Binding'), false);
});

void test('portable diagnosis rejects stale, future and unknown observations; does not attest hardware', () => {
  const s = observation({
    'network.https': true,
    'output.audio': true,
    'output.spatial': null,
  });
  const d = diagnoseHardware(s, 1001);
  assert.equal(d.eveHostCandidate, true);
  assert.equal(d.spatialDisplay, false);
  assert.equal(d.authorizationGranted, false);
  assert.equal(d.nativeOsAccepted, false);
  for (const t of [999, 31000, NaN])
    assert.throws(() => diagnoseHardware(s, t));
  assert.throws(() => diagnoseHardware({ ...s, expiresAt: 32001 }, 1001));
  assert.throws(() => diagnoseHardware({ ...s, trusted: true }, 1001));
  assert.throws(() =>
    diagnoseHardware(observation({ 'output.spatial': 'true' }), 1001),
  );
});
void test('firmware endpoint requires actual HTTPS and output features; no device fee changes', () => {
  assert.equal(
    diagnoseHardware({ ...observation(), platform: 'firmware' }, 1001)
      .eveHostCandidate,
    false,
  );
  assert.equal(runtimeContract.duplicateBaseFeePerDevice, false);
  assert.equal(
    runtimeContract.billing,
    'existing_owner_contract_and_usage_ledger',
  );
});
void test('Eve history uses existing authenticated API and keeps owner selection at service', async () => {
  let actual;
  const runtime = client(async (url, init) => {
    actual = { url, init };
    return reply({ ownerUserId: 'owner-a', items: [] });
  });
  assert.equal((await runtime.eve.list()).ownerUserId, 'owner-a');
  assert.equal(actual.url, 'https://avoado.si/api/eve/history');
  assert.equal(actual.init.headers.get('Authorization'), `Bearer ${token}`);
  assert.equal(actual.init.redirect, 'error');
  assert.equal(actual.init.credentials, 'omit');
});
void test('device pairing uses existing endpoint without forwarding existing account token', async () => {
  let init;
  const runtime = client(async (_url, value) => {
    init = value;
    return reply({ userCode: 'TEST' });
  });
  await runtime.connection.begin('Mini bench');
  assert.equal(init.headers.has('Authorization'), false);
  assert.deepEqual(JSON.parse(init.body), {
    action: 'begin',
    deviceName: 'Mini bench',
  });
});
void test('history mutation carries original CAS revision and uses same-origin binding', async () => {
  let request;
  const runtime = client(async (url, init) => {
    request = { url, init };
    return reply({ revision: 4 });
  });
  const data = { session: { id: 'test-thread' }, revision: 3, remember: false };
  assert.equal((await runtime.eve.save(data)).revision, 4);
  assert.equal(request.init.method, 'PUT');
  assert.equal(request.init.headers.get('Origin'), 'https://avoado.si');
  assert.deepEqual(JSON.parse(request.init.body), data);
  assert.throws(() => runtime.eve.save({ ...data, ownerId: 'other-owner' }));
});
void test('token refresh/revocation is consulted for every request', async () => {
  let count = 0,
    sent = 0;
  const runtime = client(
    async () => {
      sent++;
      return reply({});
    },
    { getSessionToken: async () => (++count === 1 ? token : null) },
  );
  await runtime.eve.list();
  await assert.rejects(runtime.eve.list(), { code: 'RECONNECT_REQUIRED' });
  assert.equal(sent, 1);
});
void test('401 and stale revisions are surfaced without retries or alternate route', async () => {
  for (const status of [401, 409, 503]) {
    let calls = 0;
    const runtime = client(async () => {
      calls++;
      return replyStatus(status);
    });
    await assert.rejects(
      runtime.jobs.command(jobId, 1, { id: commandId, action: 'cancel' }),
      { status, outcome: status === 503 ? 'unknown' : 'rejected' },
    );
    assert.equal(calls, 1);
  }
});
function replyStatus(status) {
  return new Response('{}', {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
void test('lost mutation response is unknown and never automatically repeated', async () => {
  let calls = 0;
  const runtime = client(async () => {
    calls++;
    throw new TypeError('offline');
  });
  await assert.rejects(
    runtime.jobs.command(jobId, 0, { id: commandId, action: 'cancel' }),
    { outcome: 'unknown' },
  );
  assert.equal(calls, 1);
});
void test('HTTPS origin, credentials and redirect policy prevent leaking tokens to chosen paths', () => {
  for (const origin of [
    'http://example.com',
    'https://u:p@example.com',
    'https://example.com/path',
    'https://example.com/?x=1',
  ]) {
    assert.throws(() =>
      createRockstarRuntime({ origin, getSessionToken: async () => token }),
    );
  }
  assert.doesNotThrow(() =>
    createRockstarRuntime({
      origin: 'http://127.0.0.1:3000',
      getSessionToken: async () => token,
    }),
  );
});
void test('client cannot forge Tool success; workflow cancel uses existing revision and idempotency', () => {
  const job = createPrivateLinuxWorkJob(
    jobId,
    'Portable Eve',
    'Compare a bounded output',
  );
  const command = { id: commandId, action: 'cancel' };
  const next = reduceEveCommand(job, command, 0);
  assert.equal(next.status, 'cancelled');
  assert.equal(next.revision, 1);
  assert.deepEqual(reduceEveCommand(next, command, 0), next);
  assert.throws(() => reduceEveCommand(job, command, 3));
  assert.throws(() =>
    reduceEveCommand(
      job,
      {
        id: commandId,
        action: 'record',
        stepId: 'generate',
        tool: 'sky-linux-text',
        transport: 'browser',
        outcome: 'passed',
        sample: false,
        durationMs: 1,
      },
      0,
    ),
  );
});
void test('approved text reuses server quote pipeline and rejects unapproved external generation', async () => {
  let seen;
  const runtime = client(async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return reply({ execution: { state: 'queued' } });
  });
  const value = {
    provider: 'openai',
    consent: true,
    quoteId: 'quote-1',
    approvalDigest: 'a'.repeat(64),
    prompt: 'test',
  };
  assert.throws(() =>
    runtime.text.submitApproved({ ...value, consent: false }),
  );
  assert.throws(() =>
    runtime.text.submitApproved({ ...value, baseUrl: 'https://other.example' }),
  );
  await runtime.text.submitApproved(value);
  assert.equal(seen.url, 'https://avoado.si/api/llm/text');
  assert.deepEqual(seen.body, value);
});
void test('large input and invalid response are bounded; no raw service error is exposed', async () => {
  const runtime = client(
    async () =>
      new Response('not JSON', { headers: { 'content-type': 'text/html' } }),
  );
  await assert.rejects(runtime.eve.list(), {
    code: 'INVALID_SERVICE_RESPONSE',
  });
  await assert.rejects(
    runtime.eve.save({
      session: { text: 'a'.repeat(640001) },
      revision: 0,
      remember: false,
    }),
    { code: 'REQUEST_TOO_LARGE' },
  );
});
void test('two client hosts query the existing account entitlement without creating device charges', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body });
    return reply({ entitlements: [] });
  };
  await client(fetchImpl).entitlement();
  await client(fetchImpl).entitlement();
  assert.deepEqual(
    calls,
    Array.from({ length: 2 }, () => ({
      url: 'https://avoado.si/api/rockstar/entitlements',
      method: 'GET',
      body: undefined,
    })),
  );
});
void test('deadline aborts one pending mutation and leaves its effect unknown', async () => {
  let calls = 0;
  const runtime = client(
    async (_url, init) => {
      calls++;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new Error('aborted')),
          { once: true },
        );
      });
    },
    { timeoutMs: 100 },
  );
  await assert.rejects(
    runtime.jobs.command(jobId, 0, { id: commandId, action: 'cancel' }),
    { code: 'TIMEOUT', outcome: 'unknown' },
  );
  assert.equal(calls, 1);
});
void test('oversized service body is rejected before decoding or storing history', async () => {
  const runtime = client(
    async () =>
      new Response('a'.repeat(1000001), {
        headers: { 'content-type': 'application/json' },
      }),
  );
  await assert.rejects(runtime.eve.list(), {
    code: 'SERVICE_RESPONSE_TOO_LARGE',
  });
});

void test('linked execution ports bind the existing session and origin, with no host-side approval creator', async () => {
  const calls = [];
  const runtime = client(async (url, init) => {
    calls.push({ url, init });
    return reply({ ok: true });
  });
  await runtime.executions.inspect();
  await runtime.executions.read(jobId);
  await runtime.executions.announce({ schema: 'fixture' });
  await runtime.executions.claim({
    id: jobId,
    claimId: commandId,
    requestSha256: 'cd'.repeat(32),
  });
  await runtime.executions.authorize(jobId, commandId);
  await runtime.executions.publish({ report: { id: jobId }, revision: 0 });
  await runtime.executions.acknowledge(jobId, commandId);
  assert.equal(runtime.executions.enqueue, undefined);
  assert.equal(calls.length, 7);
  for (const { url, init } of calls) {
    assert.ok(url.startsWith('https://avoado.si/api/eve/runtime'));
    assert.equal(init.headers.get('Authorization'), `Bearer ${token}`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    if (init.method !== 'GET')
      assert.equal(init.headers.get('Origin'), 'https://avoado.si');
  }
});

void test('an attached-object host reads the existing owner-bound Sky agent without creating execution authority',async()=>{
 let actual;const runtime=client(async(url,init)=>{actual={url,init};return reply({ownerUserId:'owner-a',agent:{id:jobId,revision:2,attachment:{schema:'sky.object-attachment/1',objectName:'Plate',input:'button',output:'text'}}});});
 const result=await runtime.sky.inspectAgent(jobId);
 assert.equal(actual.url,'https://avoado.si/api/sky/agents?id='+jobId);
 assert.equal(actual.init.headers.get('Authorization'),`Bearer ${token}`);
 assert.equal(actual.init.method,'GET');assert.equal(actual.init.redirect,'error');
 assert.equal(result.agent.revision,2);assert.equal(result.agent.attachment.objectName,'Plate');
 assert.equal(Object.hasOwn(result,'executionAuthorized'),false);
 assert.throws(()=>runtime.sky.inspectAgent('../another?token=secret'));
});
