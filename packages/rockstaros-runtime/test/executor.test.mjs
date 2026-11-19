import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTextExecutor, executionDigest, projectTextReceipt, projectPixelTextReceipt } from '../src/executor.mjs';
import { describeAdapter, negotiateTextAdapters } from '../../../lib/rockstar-adapters.ts';
import { openNodeExecutorJournal, createOllamaExecutor } from '../src/node-host.mjs';
import { beginLinuxRun, finishLinuxRun } from '../../../lib/sky-linux-local.ts';
import { readBoundedStream } from '../../../lib/bounded-stream.ts';
const at = 100000, jobId = '01234567-1234-4234-8234-0123456789ab', threadId = '01234567-1234-4234-8234-0123456789ac';
const owner = 'fixture-owner', pin = { id: 'fixture:1', scheme: 'gguf-sha256', sha256: 'a'.repeat(64) };
const descriptors = (platform = 'web') => [describeAdapter('host', 'host', platform, { 'identity.owner-local': true, 'store.cas': true }, at), describeAdapter('engine', 'executor', 'linux', { 'text.generate': true, 'model.pin': true }, at), describeAdapter('out', 'output', platform, { 'output.text': true }, at)];
async function request(extras = {}) { const agent = { name: 'Fixture', instructions: 'Return a short draft, no tools.', modelId: pin.id }; return { id: jobId, threadId, input: 'Synthetic input', agent: { id: threadId, ...agent, sha256: await executionDigest(JSON.stringify(agent)) }, model: pin, deadline: at + 1000, maxOutputTokens: 100, ...extras }; }
function memory() {
  const records = new Map();
  return { async get(id) { return structuredClone(records.get(id) ?? null); }, async claim(record) { if (records.has(record.id)) return { created: false, record: structuredClone(records.get(record.id)) }; records.set(record.id, structuredClone(record)); return { created: true, record }; },
    async replace(id, revision, record) { assert.equal(records.get(id).revision, revision); records.set(id, structuredClone(record)); } };
}
function setup({ journal = memory(), generate, authorize = async b => b, platform = 'web', subject = owner } = {}) {
  const [h, e, o] = descriptors(platform); let calls = 0;
  const core = createTextExecutor({ owner: subject, journal, authorize, now: () => at, host: async () => h, output: { describe: async () => o },
    driver: { describe: async () => e, generate: async (r, signal) => { calls++; return generate ? generate(r, signal) : { text: 'A draft.', model: r.model, durationMs: 12 }; } } });
  return { core, journal, calls: () => calls };
}
void test('negotiation refuses unknown capabilities, wrong roles, expiry and incompatible ABI', () => {
  const ds = descriptors(); assert.equal(negotiateTextAdapters(...ds, at).protocol, 1);
  assert.equal(negotiateTextAdapters(...ds, at).authorizationGranted, false);
  for (const changed of [{ ...ds[1], protocols: [2] }, { ...ds[1], expiresAt: at }, { ...ds[1], capabilities: { 'text.generate': null, 'model.pin': true } }, { ...ds[1], role: 'host' }]) assert.throws(() => negotiateTextAdapters(ds[0], changed, ds[2], at));
  assert.throws(() => negotiateTextAdapters({ ...ds[0], owner }, ds[1], ds[2], at));
});
void test('Web, Android and additional host use identical workflow, fee and output fixtures', async () => {
  const req = await request(), values = [];
  for (const platform of ['web', 'android', 'macos']) { const s = setup({ platform }); const r = await s.core.submit(req); assert.equal(r.work.templateId, 'sky-text-private'); assert.equal(r.work.status, 'review'); const out = await projectTextReceipt(r); assert.equal(out.externalToolSuccess, false); values.push(out); }
  assert.deepEqual(values[0], values[1]); assert.deepEqual(values[1], values[2]);
  const linux = finishLinuxRun(beginLinuxRun(req.agent, req.input, req.id, pin.sha256), { text: 'A draft.', modelSha256: pin.sha256, durationMs: 12 });
  const pixel = await projectPixelTextReceipt(linux, threadId); assert.equal(pixel.provenance, 'linked-device-report');
  const comparable = value => { const v = structuredClone(value); delete v.provenance; delete v.usage.resources; delete v.usage.idle; return v; };
  assert.deepEqual(comparable(pixel), comparable(values[0])); assert.match(pixel.usage.resources, /Linux/u); assert.match(values[0].usage.resources, /この実行先/u);
});
void test('concurrent same ID dispatches once and duplicate never reexecutes', async () => {
  const s = setup(), req = await request(); const results = await Promise.all([s.core.submit(req), s.core.submit(req)]); assert.equal(s.calls(), 1); assert.ok(results.some(r => r.state === 'review'));
  assert.equal((await s.core.submit(req)).state, 'review'); assert.equal(s.calls(), 1);
  await assert.rejects(s.core.submit({ ...req, input: 'Changed input' }), { code: 'REQUEST_ID_CONFLICT' }); assert.equal(s.calls(), 1);
});
void test('authorization and cross-owner records fail before computation', async () => {
  const denied = setup({ authorize: async () => null }); await assert.rejects(denied.core.submit(await request()), { code: 'AUTHORIZATION_REQUIRED' }); assert.equal(denied.calls(), 0);
  const shared = memory(), first = setup({ journal: shared }); await first.core.submit(await request()); const other = setup({ journal: shared, subject: 'other-owner' }); await assert.rejects(other.core.read(jobId), { code: 'OWNER_MISMATCH' });
});
void test('caller cannot add cost, owner, shell or substitute model/agent identities', async () => {
  const s = setup(), r = await request();
  for (const extra of [{ maximumCostMinor: 1 }, { owner: 'other-owner' }, { shell: 'id' }]) await assert.rejects(s.core.submit({ ...r, ...extra }));
  for (let code = 0; code < 32; code++) if (![9, 10, 13].includes(code)) await assert.rejects(s.core.submit({ ...r, input: 'a' + String.fromCharCode(code) }), { code: 'INVALID_INPUT' });
  await assert.rejects(s.core.submit({ ...r, agent: { ...r.agent, instructions: 'changed' } }), { code: 'AGENT_PIN_MISMATCH' }); assert.equal(s.calls(), 0);
});
void test('lost executor response stays UNKNOWN across read and retry of same ID', async () => {
  const s = setup({ generate: async () => { throw new Error('connection lost'); } }), req = await request();
  assert.equal((await s.core.submit(req)).observedState, 'unknown'); assert.equal((await s.core.submit(req)).state, 'unknown'); assert.equal(s.calls(), 1); await assert.rejects(projectTextReceipt(await s.core.read(jobId)));
});
void test('mismatched runtime model or revoked approval cannot produce a result receipt', async () => {
  const s = setup({ generate: async r => ({ text: 'Untrusted', model: { ...r.model, sha256: 'b'.repeat(64) }, durationMs: 1 }) }); assert.equal((await s.core.submit(await request())).state, 'unknown');
  let n = 0; const revoked = setup({ authorize: async b => ++n === 1 ? b : null }); assert.equal((await revoked.core.submit(await request())).state, 'unknown');
});
void test('deadline bounds a driver that ignores abort and does not retry', async () => {
  const s = setup({ generate: async () => new Promise(() => {}) }), req = await request({ deadline: at + 20 });
  const r = await s.core.submit(req); assert.equal(r.errorCode, 'EXECUTION_DEADLINE'); assert.equal(r.state, 'unknown'); assert.equal(s.calls(), 1);
});
void test('authorization hooks cannot bypass the deadline before or after execution', async () => {
  const req = await request({ deadline: at + 20 });
  const first = setup({ authorize: async () => new Promise(() => {}) }); await assert.rejects(first.core.submit(req), { code: 'AUTHORIZATION_TIMEOUT' }); assert.equal(first.calls(), 0);
  let n = 0; const later = setup({ authorize: async b => ++n === 1 ? b : new Promise(() => {}) }); const r = await later.core.submit(req); assert.equal(r.state, 'unknown'); assert.equal(r.errorCode, 'AUTHORIZATION_TIMEOUT'); assert.equal(later.calls(), 1);
});
void test('shared bounded input preserves Japanese across UTF-8 chunk boundaries', async () => {
  const bytes = new TextEncoder().encode('{"input":"日本語の依頼"}');
  const stream = new ReadableStream({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)); c.close(); } });
  const reader = stream.getReader(); try { assert.deepEqual(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readBoundedStream(reader, 16000, () => new Error('too large')))), { input: '日本語の依頼' }); } finally { reader.releaseLock(); }
});
void test('private journal persists same ID, holds exclusive lock and survives reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rock-core02-')); let journal;
  try {
    journal = await openNodeExecutorJournal(directory); await assert.rejects(openNodeExecutorJournal(directory));
    const s = setup({ journal, subject: journal.owner }), req = await request(); await s.core.submit(req); await journal.close(); journal = await openNodeExecutorJournal(directory);
    const restored = setup({ journal, subject: journal.owner }); assert.equal((await restored.core.submit(req)).state, 'review'); assert.equal(restored.calls(), 0);
    const saved = JSON.parse(await readFile(join(directory, 'executions.json'), 'utf8')); assert.equal(Object.keys(saved.records).length, 1); assert.equal(saved.records[jobId].usage.cloudUsageMinor, 0);
  } finally { await journal?.close(); await rm(directory, { recursive: true, force: true }); }
});
void test('private journal refuses foreign owner and schema without erasing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rock-core02-'));
  try { const bad = JSON.stringify({ schema: 1, owner: 'other-owner', records: {} }); await writeFile(join(directory, 'executions.json'), bad, { mode: 0o600 }); await assert.rejects(openNodeExecutorJournal(directory)); assert.equal(await readFile(join(directory, 'executions.json'), 'utf8'), bad); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
void test('closing the journal rejects new writes and waits for accepted operations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rock-core02-'));
  try { const j = await openNodeExecutorJournal(directory); const pending = j.get(jobId); const closing = j.close(); assert.throws(() => j.get(jobId), { code: 'JOURNAL_CLOSED' }); assert.equal(await pending, null); await closing; await j.close(); }
  finally { await rm(directory, { recursive: true, force: true }); }
});
void test('Ollama adapter pins installed manifest and only calls fixed loopback tags/chat', async () => {
  const model = { id: 'fixture:1', scheme: 'ollama-manifest-sha256', sha256: pin.sha256 }, seen = [];
  const driver = createOllamaExecutor({ fetchImpl: async (url, init) => { seen.push({ url, init }); return Response.json(url.endsWith('/api/tags') ? { models: [{ name: model.id, digest: model.sha256, size: 1000, details: { format: 'gguf' } }] } : url.endsWith('/api/show') ? { details: { format: 'gguf' }, capabilities: ['completion'] } : { model: model.id, done: true, done_reason: 'stop', message: { content: 'Draft.' } }); } });
  await driver.describe(model); const result = await driver.generate(await request({ model }), AbortSignal.timeout(1000)); assert.equal(result.text, 'Draft.'); assert.equal(seen.length, 7); assert.ok(seen.every(s => s.url.startsWith('http://127.0.0.1:11434/api/') && s.init.redirect === 'error')); const body = JSON.parse(seen.find(s => s.url.endsWith('/api/chat')).init.body); assert.equal(body.options.num_predict, 100); assert.equal(body.tools, undefined); assert.equal(body.stream, false);
  await assert.rejects(driver.describe({ ...model, sha256: 'b'.repeat(64) }), { code: 'MODEL_PIN_NOT_INSTALLED' });
});
void test('Ollama remote aliases and unknown locality are refused before sending a prompt', async () => {
  const model = { id: pin.id, scheme: 'ollama-manifest-sha256', sha256: pin.sha256 };
  for (const kind of ['tag-remote', 'show-remote', 'unknown-format']) {
    const seen = [];
    const driver = createOllamaExecutor({ fetchImpl: async url => { seen.push(url); return Response.json(url.endsWith('/api/tags') ? { models: [{ name: model.id, digest: model.sha256, size: 1000, details: { format: kind === 'unknown-format' ? '' : 'gguf' }, ...(kind === 'tag-remote' ? { remote_host: 'https://example.invalid' } : {}) }] } : { details: { format: 'gguf' }, capabilities: ['completion'], ...(kind === 'show-remote' ? { remote_model: 'fixture-cloud' } : {}) }); } });
    await assert.rejects(driver.describe(model)); assert.ok(seen.every(url => !url.endsWith('/api/chat')));
  }
});
