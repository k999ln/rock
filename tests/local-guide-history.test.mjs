import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({
  entryPoints: [new URL('../lib/local-guide-history.ts', import.meta.url).pathname],
  bundle: true, write: false, format: 'esm', platform: 'browser',
});
const { executeLocalGuide } = await import('data:text/javascript;base64,' +
  Buffer.from(built.outputFiles[0].text).toString('base64'));
globalThis.window = new EventTarget();
const options = {
  tool: 'rockstar-legal-intake', saveHistory: true, inputBytes: 40,
};
const json = (value, status = 200) => Response.json(value, { status });

await test('default opt-out performs local work without any network request', async () => {
  globalThis.fetch = () => { throw new Error('unexpected network'); };
  const r = await executeLocalGuide({ ...options, saveHistory: false,
    task: () => ({ output: 'PRIVATE local advice' }) });
  assert.equal(r.result.output, 'PRIVATE local advice');
  assert.equal(r.warning, '');
  assert.equal(r.needsSignin, false);
});

await test('consented history records metadata only with the actual tool and browser transport', async () => {
  const requests = [];
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    requests.push({ path, body });
    return json({ id: body.id ?? 'job', status: body.status ?? 'running' });
  };
  for (const tool of ['rockstar-legal-intake', 'rockstar-patent-assistant']) {
    const r = await executeLocalGuide({ ...options, tool,
      task: () => ({ output: 'PRIVATE invention and personal details' }) });
    assert.equal(r.warning, '');
    assert.equal(r.needsSignin, false);
  }
  assert.equal(requests.length, 6);
  assert.equal(requests[0].body.tool, 'rockstar-legal-intake');
  assert.equal(requests[3].body.tool, 'rockstar-patent-assistant');
  assert.equal(requests[0].body.transport, 'browser');
  assert.equal(requests[2].body.status, 'completed');
  assert.ok(Number.isInteger(requests[2].body.durationMs));
  assert.ok(requests[2].body.outputBytes > 0);
  assert.equal(JSON.stringify(requests).includes('PRIVATE'), false);
});

await test('expired sign-in retains the result and clearly reports unsaved history', async () => {
  let calls = 0, runs = 0;
  globalThis.fetch = async () => { calls++; return json({ error: 'signin' }, 401); };
  const r = await executeLocalGuide({ ...options,
    task: () => { runs++; return { output: 'local result' }; } });
  assert.equal(calls, 1);
  assert.equal(runs, 1);
  assert.equal(r.needsSignin, true);
  assert.match(r.warning, /未保存/);
  assert.equal(r.result.output, 'local result');
});

await test('ambiguous start does not retry the start or duplicate local work', async () => {
  let calls = 0, runs = 0;
  globalThis.fetch = async (path, init) => {
    calls++;
    if (path === '/api/jobs') return json({ id: JSON.parse(init.body).id });
    throw new Error('response lost');
  };
  const r = await executeLocalGuide({ ...options,
    task: () => { runs++; return { output: 'local result' }; } });
  assert.equal(calls, 2);
  assert.equal(runs, 1);
  assert.ok(r.warning);
  assert.equal(r.needsSignin, false);
});

await test('completion reporting retries metadata only and preserves the local result', async () => {
  let reports = 0, runs = 0;
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'finish') {
      reports++;
      return json({ error: 'unavailable' }, 503);
    }
    return json({ id: body.id ?? 'job' });
  };
  const r = await executeLocalGuide({ ...options,
    task: () => { runs++; return { output: 'valuable draft' }; } });
  assert.equal(runs, 1);
  assert.equal(reports, 2);
  assert.equal(r.result.output, 'valuable draft');
  assert.ok(r.warning);
  assert.match(r.warning, /HTTP_503/);
});

await test('failed local calculation is reported once and never retried as a history fallback', async () => {
  let runs = 0;
  const reports = [];
  globalThis.fetch = async (path, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'finish') reports.push(body.status);
    return json({ id: body.id ?? 'job' });
  };
  const failure = new Error('PRIVATE local computation failure');
  await assert.rejects(() => executeLocalGuide({ ...options,
    task: () => { runs++; throw failure; } }), (error) => error === failure);
  assert.equal(runs, 1);
  assert.deepEqual(reports, ['failed']);
});

await test('non-JSON authentication error still offers sign-in and does not expose its body', async () => {
  globalThis.fetch = async () => new Response('<html>PRIVATE account details</html>', { status: 401 });
  const r = await executeLocalGuide({ ...options, task: () => ({ output: 'local' }) });
  assert.equal(r.needsSignin, true);
  assert.match(r.warning, /未保存/);
  assert.equal(r.warning.includes('PRIVATE'), false);
});

await test('unexpected success HTML is an unconfirmed save, not a successful job', async () => {
  globalThis.fetch = async () => new Response('<html>PRIVATE gateway details</html>');
  const r = await executeLocalGuide({ ...options, task: () => ({ output: 'local' }) });
  assert.equal(r.result.output, 'local');
  assert.match(r.warning, /INVALID_RESPONSE/);
  assert.equal(r.warning.includes('PRIVATE'), false);
});

await test('request failures distinguish timeout from transport and never repeat creation', async () => {
  for (const [error, code] of [[new DOMException('PRIVATE timeout', 'TimeoutError'), 'TIMEOUT'],
    [new TypeError('PRIVATE transport details'), 'NETWORK']]) {
    let calls = 0, runs = 0;
    globalThis.fetch = async () => { calls++; throw error; };
    const r = await executeLocalGuide({ ...options,
      task: () => { runs++; return { output: 'local' }; } });
    assert.equal(calls, 1);
    assert.equal(runs, 1);
    assert.ok(r.warning.includes(code));
    assert.equal(r.warning.includes('PRIVATE'), false);
  }
});

await test('owned JSON API redirects are not followed and recover through sign-in', async () => {
  let calls = 0;
  globalThis.fetch = async (path, init) => {
    calls++;
    assert.equal(init.redirect, 'manual');
    return new Response(null, { status: 302, headers: { location: 'https://example.invalid/private' } });
  };
  const r = await executeLocalGuide({ ...options, task: () => ({ output: 'local' }) });
  assert.equal(calls, 1);
  assert.equal(r.needsSignin, true);
  assert.equal(r.warning.includes('example.invalid'), false);
});
