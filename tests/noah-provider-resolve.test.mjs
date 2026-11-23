import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveNoahProvider, noahProjectSources } from '../lib/noah-provider-resolve.ts';
import { noahProjectDetail } from '../lib/noah-project-api.ts';
import { noahCloudEntry } from '../lib/noah-cloud-api.ts';
import { auditNoahEntry } from '../scripts/noah-agent-coverage.mjs';
const id = 'project-' + 'a'.repeat(64);
const row = (href = 'https://github.com/maker/agent', sources = []) => ({ card: { id, feedbackId: id, name: 'Agent', href, sources }, families: [], observedAt: 0 });
const manifest = url => ({ name: 'io.github.maker/agent', version: '1.0.0', remotes: [{ type: 'streamable-http', url }] });
void test('all first-party sources are considered before a CLI fallback; aggregator URLs do not grant execution identity', async () => {
  const entry = row(undefined, [{ source: 'huggingface', sourceUrl: 'https://huggingface.co/spaces/maker/agent' }]);
  assert.equal(noahProjectDetail(entry).connection.kind, 'space');
  assert.equal((await resolveNoahProvider(entry, async () => { throw Error('must not fetch'); })).kind, 'space');
  const aggregator = row('https://github.com/maker/agent', [{ source: 'awesome', sourceUrl: 'https://github.com/NousResearch/hermes-agent' }]);
  assert.equal(noahCloudEntry(aggregator), null);
  assert.deepEqual(noahProjectSources(aggregator), ['https://github.com/maker/agent']);
});
void test('repository-owned server.json resolves a public MCP without running tools or source code', async () => {
  const calls = [];
  const result = await resolveNoahProvider(row(), async (url, init) => { calls.push(url); assert.equal(init.redirect, 'manual'); return Response.json(manifest('https://provider.example.com/mcp')); });
  assert.equal(result.kind, 'mcp'); assert.equal(result.url, 'https://provider.example.com/mcp');
  assert.deepEqual(calls, ['https://raw.githubusercontent.com/maker/agent/HEAD/server.json']);
});
void test('private targets, published secrets, templates and redirect destinations are never used', async () => {
  for (const target of ['http://provider.example.com/mcp', 'https://127.0.0.1/mcp', 'https://localhost/mcp', 'https://user:pass@provider.example.com/mcp', 'https://provider.example.com/{token}']) {
    const calls = [];
    await assert.rejects(resolveNoahProvider(row(), async url => { calls.push(url); return url.endsWith('server.json') ? Response.json(manifest(target)) : new Response(null, { status: 404 }); }));
    assert.ok(calls.every(url => url.startsWith('https://raw.githubusercontent.com/')));
  }
  await assert.rejects(resolveNoahProvider(row(), async () => Response.json({ ...manifest('https://provider.example.com/mcp'), remotes: [{ type: 'streamable-http', url: 'https://provider.example.com/mcp', headers: [{ name: 'Authorization', isRequired: true, isSecret: true }] }] })), /認証情報/);
  let calls = 0;
  await assert.rejects(resolveNoahProvider(row(), async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/' } }); }));
  assert.equal(calls, 1);
});
void test('npm mcpName requires the active official record to name the exact package version', async () => {
  const entry = row('https://www.npmjs.com/package/@maker/agent');
  const fetcher = version => async url => String(url).startsWith('https://registry.npmjs.org/')
    ? Response.json({ name: '@maker/agent', version: '1.2.3', mcpName: 'io.github.maker/agent' })
    : Response.json({ server: { ...manifest('https://provider.example.com/mcp'), packages: [{ registryType: 'npm', identifier: '@maker/agent', version }] }, _meta: { 'io.modelcontextprotocol.registry/official': { status: 'active' } } });
  assert.equal((await resolveNoahProvider(entry, fetcher('1.2.3'))).kind, 'mcp');
  await assert.rejects(resolveNoahProvider(entry, fetcher('9.9.9')));
});
void test('Docker identity uses the official catalog and a fixed upstream commit, not a guessed hostname', async () => {
  const sha = 'b'.repeat(40), calls = [];
  const target = await resolveNoahProvider(row('https://hub.docker.com/r/mcp/example'), async url => {
    calls.push(url);
    return typeof url === 'string' && url.endsWith('server.yaml') ? new Response(`name: example\nsource:\n  project: https://github.com/maker/agent\n  commit: ${sha}\n  directory: src/example\n`)
      : Response.json(manifest('https://provider.example.com/mcp'));
  });
  assert.equal(target.repository, 'https://hub.docker.com/r/mcp/example');
  assert.equal(calls[1], `https://raw.githubusercontent.com/maker/agent/${sha}/src/example/server.json`);
});
void test('coverage counts metadata and fixed profiles separately from execution success', async () => {
  const result = await auditNoahEntry(row('https://hub.docker.com/r/mcp/time'));
  assert.equal(result.state, 'cloud_profile'); assert.equal(result.executionVerified, false);
  const result2 = await auditNoahEntry(row(), { live: false });
  assert.equal(result2.state, 'needs_resolution'); assert.equal(result2.executionVerified, false);
});
void test('monorepo distribution folders require an immutable full commit', async () => {
  const commit = 'd'.repeat(40), calls = [];
  const target = await resolveNoahProvider(row(`https://github.com/maker/repo/tree/${commit}/toolkits/agent`), async url => { calls.push(url); return Response.json(manifest('https://provider.example.com/mcp')); });
  assert.equal(target.kind, 'mcp'); assert.equal(calls[0], `https://raw.githubusercontent.com/maker/repo/${commit}/toolkits/agent/server.json`);
  await assert.rejects(resolveNoahProvider(row('https://github.com/maker/repo/tree/main/toolkits/agent'), async () => { throw Error('must not guess branch paths'); }));
});
