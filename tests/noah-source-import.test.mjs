import assert from 'node:assert/strict';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import { readNoahArchive, writeNoahArchive } from '../lib/noah-source-archive.ts';
import { refactorNoahSource } from '../lib/noah-upload-refactor.ts';
import { importNoahSource, noahSourceRepository } from '../lib/noah-source-import.ts';
import { createNoahAgentApi } from '../lib/noah-agent-api.ts';
import { ownerScopeFor } from '../lib/owner-intent.ts';

const source = 'export function enabled(x) { if (x) return true; else return false; }';
const sha = 'a'.repeat(40);
const text = bytes => new TextDecoder().decode(bytes);
const archive = files => writeNoahArchive(Object.entries(files).map(([name, content]) => ({ name, bytes: strToU8(content), os: 3, attrs: 0o100644 << 16 })));
void test('ZIP refactor changes both source files while retaining license and unrelated file bytes', async () => {
  const original = archive({ 'lib/a.ts': source, 'lib/b.js': source, LICENSE: 'Copyright example\nMIT', 'agent.py': 'print(42)\n', 'data.bin': '\u0000binary' });
  const result = await refactorNoahSource('code.zip', original);
  assert.equal(result.report.status, 'refactored'); assert.equal(result.report.validation, 'syntax');
  assert.deepEqual(result.report.changes.map(c => c.file), ['lib/a.ts', 'lib/b.js']);
  const files = new Map(readNoahArchive(result.bytes).map(f => [f.name, f.bytes]));
  assert.match(text(files.get('lib/a.ts')), /return !!\(x\)/);
  assert.equal(text(files.get('LICENSE')), 'Copyright example\nMIT'); assert.equal(text(files.get('agent.py')), 'print(42)\n');
  assert.equal(text(readNoahArchive(original)[0].bytes), source);
  assert.deepEqual((await refactorNoahSource('code.zip', original)).bytes, result.bytes);
});
void test('a syntax error rolls back the entire archive, not a partial set of edits', async () => {
  const original = archive({ 'a.ts': source, 'b.ts': 'function broken(' });
  const result = await refactorNoahSource('code.zip', original);
  assert.equal(result.report.status, 'failed'); assert.deepEqual(result.report.changes, []); assert.deepEqual(result.bytes, original);
});
void test('archive validation rejects traversal, symlinks, duplicate aliases, encryption and expansion claims before extraction', async () => {
  const cases = [zipSync({ '../outside.js': strToU8(source) }), zipSync({ '/outside.js': strToU8(source) }), zipSync({ 'x.js': [strToU8(source), { os: 3, attrs: 0o120777 << 16 }] }), zipSync({ 'A.js': strToU8(source), 'a.js': strToU8(source) }), zipSync({ 'dir\\x.js': strToU8(source) })];
  const oversized = archive({ 'a.js': source }), encrypted = oversized.slice();
  const central = oversized.findIndex((b, i) => b === 0x50 && oversized[i + 1] === 0x4b && oversized[i + 2] === 1 && oversized[i + 3] === 2);
  new DataView(oversized.buffer).setUint32(central + 24, 11 * 1024 * 1024, true); cases.push(oversized);
  new DataView(encrypted.buffer).setUint16(central + 8, 1, true); cases.push(encrypted);
  for (const bytes of cases) { assert.throws(() => readNoahArchive(bytes)); const result = await refactorNoahSource('code.zip', bytes); assert.equal(result.report.status, 'failed'); assert.deepEqual(result.bytes, bytes); }
  const badCRC = archive({ 'a.js': source }); new DataView(badCRC.buffer).setUint32(central + 16, 0, true); assert.throws(() => readNoahArchive(badCRC));
});
void test('metadata-only ZIP is unchanged and code count limits preserve the exact original', async () => {
  const original = archive({ README: 'read me', 'agent.py': 'print(42)' });
  assert.deepEqual((await refactorNoahSource('code.zip', original)).bytes, original);
  const tooMany = archive(Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`a${i}.ts`, source])));
  assert.equal((await refactorNoahSource('code.zip', tooMany)).report.status, 'failed');
});
void test('only explicit public GitHub and Hugging Face repository URLs are accepted', () => {
  assert.equal(noahSourceRepository('https://github.com/owner/repo.git').url, 'https://github.com/owner/repo');
  assert.equal(noahSourceRepository('https://huggingface.co/spaces/owner/repo').kind, 'spaces');
  for (const url of ['http://github.com/o/r', 'https://github.com.evil.test/o/r', 'https://a:b@github.com/o/r', 'https://github.com/o/r?token=key', 'https://github.com/o/r/tree/main', 'https://127.0.0.1/o/r', 'https://huggingface.co/spaces/o/r/resolve/main/file.py']) assert.throws(() => noahSourceRepository(url));
});
function providerFixture(provider = 'github', extra = {}) {
  const requests = [];
  const fetcher = async (url, init) => {
    requests.push({ url, init }); assert.equal(init.redirect, 'manual'); assert.equal(init.headers.Authorization, undefined);
    if (url.includes('/commits/')) return Response.json({ sha });
    if (url.includes('/git/trees/')) return Response.json({ truncated: false, tree: ['agent.ts', 'LICENSE', 'model.safetensors'].map(path => ({ path, type: 'blob', mode: '100644' })), ...extra });
    if (url.includes('/revision/')) return Response.json({ sha, siblings: ['agent.ts', 'LICENSE', 'model.safetensors'].map(rfilename => ({ rfilename })), ...extra });
    assert.ok(url.includes(sha), 'all file URLs must be pinned to resolved commit');
    return new Response(url.endsWith('LICENSE') ? 'MIT license fixture' : source);
  };
  return { fetcher, requests, input: { url: provider === 'github' ? 'https://github.com/owner/repo' : 'https://huggingface.co/spaces/owner/repo', rightsConfirmed: true } };
}
void test('both providers import immutable source bytes with provenance; weights omitted explicitly; same pipeline refactors', async () => {
  for (const provider of ['github', 'huggingface']) {
    const fixture = providerFixture(provider), result = await importNoahSource(fixture.input, fixture.fetcher);
    assert.equal(result.record.commit, sha); assert.equal(result.record.omittedFiles, 1); assert.equal(result.record.scope, 'source-files-only');
    assert.equal(result.record.files.length, 2); assert.ok(fixture.requests.every(r => !r.url.includes('safetensors')));
    const files = readNoahArchive(result.bytes); assert.equal(files.length, 3);
    assert.equal(JSON.parse(text(files.find(f => f.name === 'noah-import.json').bytes)).commit, sha);
    assert.equal((await refactorNoahSource(result.name, result.bytes)).report.status, 'refactored');
  }
});
void test('private/gated, truncated listings, oversized file and external redirect never produce a partial artifact', async () => {
  for (const [provider, metadata] of [['huggingface', { gated: true }], ['huggingface', { private: true }], ['github', { truncated: true }]]) {
    const fixture = providerFixture(provider, metadata); await assert.rejects(importNoahSource(fixture.input, fixture.fetcher));
    assert.ok(fixture.requests.every(r => !r.url.includes('/resolve/') && !r.url.includes('raw.githubusercontent')));
  }
  const fixture = providerFixture();
  for (const response of [() => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/secrets' } }), () => new Response('too big', { headers: { 'content-length': '999999999' } })]) {
    await assert.rejects(importNoahSource(fixture.input, (url, init) => url.includes('raw.githubusercontent') ? response() : fixture.fetcher(url, init)));
  }
});
void test('source-import API requires account, same origin, current owner intent and rights before network', async () => {
  let calls = 0;
  const fixture = providerFixture();
  const api = createNoahAgentApi({ db: {}, authenticate: async r => { if (!r.headers.get('test-owner')) throw new Error('UNAUTHORIZED'); return r.headers.get('test-owner'); }, fetcher: (...args) => { calls++; return fixture.fetcher(...args); } });
  const headers = { 'content-type': 'application/json', origin: 'https://noah.example', 'test-owner': 'alice', 'x-rock-owner-scope': await ownerScopeFor('alice') };
  const request = (patch = {}, input = fixture.input) => new Request('https://noah.example/api/noah/import', { method: 'POST', headers: { ...headers, ...patch }, body: JSON.stringify(input) });
  assert.equal((await api.importSource(request({ 'test-owner': '' }))).status, 401);
  assert.equal((await api.importSource(request({ origin: 'https://evil.example' }))).status, 403);
  assert.equal((await api.importSource(request({ 'x-rock-owner-scope': await ownerScopeFor('bob') }))).status, 409);
  assert.equal((await api.importSource(request({}, { ...fixture.input, rightsConfirmed: false }))).status, 400); assert.equal(calls, 0);
  const result = await api.importSource(request()); assert.equal(result.status, 200); assert.equal(result.headers.get('x-noah-source-commit'), sha);
  assert.equal(readNoahArchive(new Uint8Array(await result.arrayBuffer())).length, 3);
});
