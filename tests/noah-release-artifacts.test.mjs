import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireSource, downloadArtifact, sourcePlan, sha256 } from '../scripts/noah-source-fetch.mjs';
const url = 'https://registry.npmjs.org/@cline/sdk/-/sdk-0.2.0.tgz';
async function fixture(fn) { const directory = await mkdtemp(path.join(os.tmpdir(), 'noah-artifact-')); try { await fn(directory, path.join(directory, 'artifact')); } finally { await rm(directory, { recursive: true, force: true }); } }

await test('release acquisition uses reviewed version/digest and rejects catalog substitutions', async () => {
  const plan = sourcePlan({ id: 'research-8782e21ebeda898af4b7', kind: 'candidate', sources: [{ type: 'primary', url: 'https://evil.example/a' }] });
  assert.equal(plan.type, 'artifact'); assert.match(plan.url, /github.com\/aaif-goose\/goose\/releases/); assert.equal(plan.version, '1.59.1');
  await fixture(async directory => {
    for (const changed of [{ url }, { sha256: '0'.repeat(64) }, { version: 'latest' }, { agentId: 'research-unknown' }]) {
      await assert.rejects(acquireSource({ plan: { ...plan, ...changed }, directory }), /確認済み/);
    }
  });
});
await test('artifact follows only official redirects, verifies bytes and keeps existing files', async () => fixture(async (_directory, destination) => {
  const payload = 'official fixture'; const digest = sha256(payload); let calls = 0;
  const fetcher = async (address, options) => {
    calls++; assert.equal(options.redirect, 'manual'); assert.equal(options.credentials, 'omit');
    return calls === 1 ? new Response(null, { status: 302, headers: { location: 'https://release-assets.githubusercontent.com/path?signed=test' } }) : new Response(payload);
  };
  assert.equal(await downloadArtifact({ url, sha256: digest, destination, fetcher }), payload.length);
  assert.equal(await readFile(destination, 'utf8'), payload); assert.equal(calls, 2);
  await assert.rejects(downloadArtifact({ url, sha256: digest, destination, fetcher: async () => new Response(payload) }), /EEXIST/);
  assert.equal(await readFile(destination, 'utf8'), payload);
}));
await test('artifact rejects private redirect, mismatch, declared/streamed overflow and cancellation without partial files', async () => fixture(async (_directory, destination) => {
  const digest = sha256('ok'); let calls = 0;
  await assert.rejects(downloadArtifact({ url, sha256: digest, destination, fetcher: async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }); } }), /転送先/);
  assert.equal(calls, 1);
  for (const response of [new Response('bad'), new Response('ok', { headers: { 'content-length': '9999' } }), new Response('too large')]) {
    await assert.rejects(downloadArtifact({ url, sha256: digest, destination, limit: 4, fetcher: async () => response }), /上限|ハッシュ/);
    await assert.rejects(access(destination));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(downloadArtifact({ url, sha256: digest, destination, signal: controller.signal, fetcher: async () => { throw new Error('must not fetch'); } }), { name: 'AbortError' });
  await assert.rejects(access(destination));
}));
await test('cached artifact is rechecked against pinned digest, not its editable receipt', async () => fixture(async directory => {
  const plan = sourcePlan({ id: 'research-533d51d9d3dea76fea8f', kind: 'candidate' });
  const { mkdir } = await import('node:fs/promises'); const saved = path.join(directory, 'runtime-source'); await mkdir(saved);
  await writeFile(path.join(saved, 'artifact'), 'tampered');
  await writeFile(path.join(saved, 'receipt.json'), JSON.stringify({ url: plan.url, commit: plan.version, sha256: sha256('tampered') }));
  await assert.rejects(acquireSource({ plan, directory }), /固定版/);
}));
