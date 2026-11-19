import test from 'node:test';
import assert from 'node:assert/strict';
import { createEveWorkClient } from '../lib/eve-work-client.ts';

test('both Eve views retain their endpoints and explicit Work revisions without retrying', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => { calls.push({ url, options }); return Response.json({ job: { revision: 4 } }); });
  for (const resource of ['tool-work', 'news-work']) {
    const client = createEveWorkClient(resource, 'unavailable');
    await client('?thread=owner-thread');
    assert.equal(calls.at(-1).url, `/api/eve/${resource}?thread=owner-thread`);
    assert.equal(calls.at(-1).options.method, 'GET');
    assert.equal(calls.at(-1).options.body, undefined);
    const command = { jobId: 'job', revision: 3, commandId: 'request', action: 'cancel' };
    assert.deepEqual(await client('', command), { job: { revision: 4 } });
    assert.deepEqual(JSON.parse(calls.at(-1).options.body), command);
    assert.equal(calls.at(-1).options.method, 'PATCH');
    assert.equal(calls.at(-1).options.cache, 'no-store');
    assert.equal(calls.at(-1).options.credentials, 'same-origin');
    await client('', { jobId: 'new' }, 'POST');
    assert.equal(calls.at(-1).options.method, 'POST');
  }
  let attempts = 0;
  globalThis.fetch = async () => { attempts++; return Response.json({ error: 'revision conflict' }, { status: 409 }); };
  await assert.rejects(createEveWorkClient('news-work', 'unavailable')('', { action: 'cancel' }), /revision conflict/);
  assert.equal(attempts, 1);
});
