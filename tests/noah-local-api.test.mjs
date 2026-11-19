import test from 'node:test';
import assert from 'node:assert/strict';
import { createNoahLocalRequest, createNoahLocalRecordClients } from '../scripts/noah-local-api.mjs';
import { readNoahSourceBytes, NOAH_SOURCE_DOWNLOAD_LIMIT } from '../scripts/noah-source-bytes.mjs';

const incoming = { headers: { host: 'localhost:5173', cookie: 'session=fixture', authorization: 'Bearer fixture', 'oai-authenticated-user-id': 'fixture', 'x-agent-secret': 'must-not-forward', 'x-rock-owner-scope': 'untrusted' } };

await test('local transport cannot forward credentials to a remote or non-Noah destination', async () => {
  const calls = [], request = createNoahLocalRequest(incoming, async (...args) => { calls.push(args); return Response.json({ ok: true }); });
  for (const path of ['https://example.com/api/noah/agents', '//example.com/api/noah/agents', '/api/noah/../../wallet', '/api/noah/agents#secret'])
    assert.throws(() => request(path), error => error.status === 400);
  for (const host of ['example.com', 'localhost@example.com', 'localhost:5173/other', '127.0.0.1.evil.example'])
    assert.throws(() => createNoahLocalRequest({ headers: { host } }), error => error.status === 403);
  assert.equal(calls.length, 0);
  await request('/api/noah/catalog/owner');
  const [url, options] = calls[0];
  assert.equal(url, 'http://localhost:5173/api/noah/catalog/owner');
  assert.deepEqual(options.headers, { cookie: 'session=fixture', authorization: 'Bearer fixture', 'oai-authenticated-user-id': 'fixture' });
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
});

await test('record clients retain different query contracts, scope and single-attempt commands', async () => {
  const calls = [], clients = createNoahLocalRecordClients(incoming, 'owner-scope', async (url, options) => {
    calls.push({ url: new URL(url), options }); return Response.json({ ownerScope: 'owner-scope' });
  });
  const input = { id: 'id', agentId: 'agent', summary: 'yes', archived: 'yes', ignored: 'never' };
  for (const kind of ['work', 'instance', 'operation']) await clients[kind]('get', input);
  assert.deepEqual(calls.map(c => [...c.url.searchParams.keys()]), [['id', 'agentId', 'summary'], ['id', 'agentId'], ['id', 'agentId', 'archived']]);
  assert.deepEqual(calls.map(c => c.url.pathname), ['/api/noah/executions', '/api/noah/instances', '/api/noah/operations']);
  await clients.work('stop', { id: 'id', revision: 7, action: 'forged' });
  const options = calls.at(-1).options;
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['X-Rock-Owner-Scope'], 'owner-scope');
  assert.equal(options.headers.Origin, 'http://localhost:5173');
  assert.deepEqual(JSON.parse(options.body), { id: 'id', revision: 7, action: 'stop' });
  let attempts = 0;
  const failed = createNoahLocalRecordClients(incoming, 'owner-scope', async () => { attempts++; return Response.json({ error: 'conflict' }, { status: 409 }); });
  await assert.rejects(failed.work('start', { id: 'id' }), error => error.status === 409 && error.message === 'conflict');
  assert.equal(attempts, 1);
  const changed = createNoahLocalRecordClients(incoming, 'owner-scope', async () => Response.json({ ownerScope: 'other' }));
  await assert.rejects(changed.instance('get', { id: 'id' }), error => error.status === 409);
});

await test('source transport preserves exact bytes, rejects truncation and cancels oversized streams', async () => {
  const bytes = Buffer.from('日本語の固定コード');
  assert.deepEqual(await readNoahSourceBytes(new Response(bytes), bytes.length), bytes);
  await assert.rejects(readNoahSourceBytes(new Response(bytes), bytes.length + 1), error => error.status === 409);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(NOAH_SOURCE_DOWNLOAD_LIMIT + 1)); }, cancel() { cancelled = true; } });
  await assert.rejects(readNoahSourceBytes(new Response(stream), NOAH_SOURCE_DOWNLOAD_LIMIT), error => error.status === 413);
  assert.equal(cancelled, true);
  assert.equal(stream.locked, false);
});
