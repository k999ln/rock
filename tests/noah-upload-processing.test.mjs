import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { createUploadProcessingManager, uploadProcessingMiddleware } from '../scripts/noah-upload-processing.mjs';
import { resolveLocalProcessing } from '../lib/noah-processing-receipt.ts';
import { noahSha256 } from '../lib/noah-agent-upload.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';
const user = 'local-preview:rockstar-owner', scope = await ownerScopeFor(user);
const input = () => ({ id: randomUUID(), name: 'agent.py', base64: Buffer.from('print(42)').toString('base64'), rightsConfirmed: true });
const flush = () => new Promise(resolve => setImmediate(resolve));
const waitComplete = async (manager, id) => { for (let i = 0; i < 100; i++) { if (manager.status(scope, id).state === 'complete') return; await new Promise(resolve => setTimeout(resolve, 5)); } assert.fail('processing did not complete'); };
const result = async bytes => ({ bytes, report: { engine: 'noah-project-refactor/1', status: 'unsupported', validation: 'not_run', message: 'no tests', changes: [], originalSha256: await noahSha256(bytes), sourceSha256: await noahSha256(bytes), evidence: { baseline: { passed: false }, candidate: null, proposer: null, fixedTests: [] } } });

await test('processing has bounded owner-scoped idempotency, immutable inputs and secret receipt binding', async () => {
  let now = 0, count = 0;
  const manager = createUploadProcessingManager({ clock: () => now, installations: {}, executions: {}, process: async ({ bytes }) => { count++; return result(bytes); } });
  const value = input();
  await manager.start(scope, value, {}, async () => {}); await waitComplete(manager, value.id);
  const status = manager.status(scope, value.id); assert.equal(status.state, 'complete');
  await manager.start(scope, value, {}, async () => {}); assert.equal(count, 1);
  await assert.rejects(manager.start(scope, { ...value, base64: Buffer.from('changed').toString('base64') }, {}, async () => {}), e => e.status === 409);
  assert.throws(() => manager.status('other', value.id), e => e.status === 404);
  assert.throws(() => manager.receipt(scope, value.id, 'a'.repeat(64)), e => e.status === 403);
  const receipt = manager.receipt(scope, value.id, status.receipt.token);
  assert.equal(receipt.base64, value.base64); assert.equal(receipt.ownerScope, scope);
  now = 30 * 60 * 1000 + 1; assert.throws(() => manager.receipt(scope, value.id, status.receipt.token), e => e.status === 404);
  await manager.close();
});
await test('concurrent processing is bounded and stopped jobs cannot issue receipts; retry is explicit', async () => {
  let runs = 0;
  const manager = createUploadProcessingManager({ installations: {}, executions: {}, process: ({ signal, bytes }) => { runs++; if (runs > 1) return result(bytes); return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } });
  const value = input(); await manager.start(scope, value, {}, async () => {}); await flush();
  await assert.rejects(manager.start(scope, input(), {}, async () => {}), e => e.status === 429);
  assert.equal((await manager.stop(scope, value.id)).state, 'cancelled');
  assert.throws(() => manager.receipt(scope, value.id, 'a'.repeat(64)));
  await manager.start(scope, value, {}, async () => {}); await waitComplete(manager, value.id); assert.equal(manager.status(scope, value.id).state, 'complete'); await manager.close();
});
await test('processing middleware rejects foreign origins, changed owner, methods and malformed bodies before executing', async () => {
  let starts = 0;
  const middleware = uploadProcessingMiddleware({ manager: { start: async () => { starts++; return {}; } }, port: 3107, getOwner: async () => ({ ownerScope: scope, localHostOwner: true }), workFor: () => ({}) });
  const invoke = async ({ headers = {}, body = '{}', method = 'POST' } = {}) => {
    const request = Readable.from([Buffer.from(body)]); request.url = '/__noah/upload-refactor'; request.method = method;
    request.headers = { host: '127.0.0.1:3107', origin: 'http://127.0.0.1:3107', 'x-rock-owner-scope': scope, 'content-type': 'application/json', ...headers }; request.socket = { remoteAddress: '127.0.0.1' };
    let status; const response = new EventEmitter(); response.writeHead = code => { status = code; }; response.end = () => {};
    await middleware(request, response, () => assert.fail('unexpected next')); return status;
  };
  assert.equal(await invoke({ headers: { origin: 'https://evil.example' } }), 403);
  assert.equal(await invoke({ headers: { 'x-rock-owner-scope': 'other' } }), 409);
  assert.equal(await invoke({ method: 'DELETE' }), 405); assert.equal(await invoke({ body: 'null' }), 400); assert.equal(starts, 0);
  assert.equal(await invoke(), 202); assert.equal(starts, 1);
});
await test('API resolves results from fixed local host; refuses public transport, mismatched owner/input and forged success', async () => {
  const value = input(), bytes = Buffer.from(value.base64, 'base64'), processed = await result(bytes);
  const reference = { id: value.id, token: 'a'.repeat(64) }, expected = { id: value.id, name: value.name, sha256: processed.report.originalSha256, user };
  const request = new Request('http://127.0.0.1:3107/api/noah/agents');
  const receipt = { id: value.id, ownerScope: scope, name: value.name, originalSha256: expected.sha256, base64: value.base64, report: processed.report };
  const fetcher = async (url, options) => { assert.equal(url, `http://127.0.0.1:3107/__noah/upload-refactor/${value.id}/receipt`); assert.equal(options.headers['X-Rock-Owner-Scope'], scope); assert.equal(options.redirect, 'manual'); return Response.json(receipt); };
  assert.deepEqual((await resolveLocalProcessing(request, reference, expected, fetcher)).bytes, new Uint8Array(bytes));
  await assert.rejects(resolveLocalProcessing(new Request('https://public.example/api'), reference, expected, fetcher));
  for (const patch of [{ ownerScope: 'other' }, { originalSha256: 'b'.repeat(64) }, { base64: Buffer.from('tampered').toString('base64') }, { report: { ...processed.report, status: 'refactored', validation: 'fixed_tests' } }])
    await assert.rejects(resolveLocalProcessing(request, reference, expected, async () => Response.json({ ...receipt, ...patch })));
  for (const status of [301, 302, 303, 307, 308]) {
    let calls = 0;
    await assert.rejects(resolveLocalProcessing(request, reference, expected, async (_url, options) => {
      calls++; assert.equal(options.redirect, 'manual');
      return new Response(null, { status, headers: { Location: 'https://other.example/collect' } });
    }), error => error.status === 503);
    assert.equal(calls, 1, 'redirected receipt requests must not leak owner credentials or tokens');
  }
});
