// Regression coverage for task-127's offline metadata handoff.  These tests
// stay separate from the existing mouth/probe suites so their fixtures do not
// alter the historical test files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { noahMcpHandshake, noahToolsSha256 } from '../lib/noah-mouth-mcp-remote.ts';
import { noahToolSha256 } from '../lib/noah-form.ts';
import { fixture, entry, page } from './fixtures/noah/intake.mjs';
import { mcpServer, network, tool } from './fixtures/noah/mcp-server.mjs';

const REGISTRY = 'registry.modelcontextprotocol.io';
const HOST = 'capture.example.com';
const ID = 'mcp-registry:test.provider/agent-1';
const URL = `https://${HOST}/mcp`;

void test('handshake keeps explicit outputSchema while legacy hashes stay stable', async () => {
  const outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
  const server = mcpServer({ tools: [tool('describe', true, { outputSchema })] });
  const handshake = await noahMcpHandshake(URL, { fetch: server.fetch });
  assert.deepEqual(handshake.tools[0].outputSchema, outputSchema);
  const legacy = { name: 'describe', description: 'describe の説明', inputSchema: { type: 'object', properties: {} }, readOnly: true };
  assert.equal(await noahToolsSha256([legacy]), await noahToolsSha256([{ ...legacy, outputSchema: undefined }]));
  assert.notEqual(await noahToolsSha256([legacy]), await noahToolsSha256([{ ...legacy, outputSchema }]));
  assert.notEqual(await noahToolSha256(legacy), await noahToolSha256({ ...legacy, outputSchema }));
});

void test('capture hook runs only after a committed representative handshake and D1 keeps no raw definitions', async (t) => {
  const outputSchema = { type: 'object', properties: { text: { type: 'string' } } };
  const server = mcpServer({ tools: [tool('describe', true, { outputSchema })] });
  const registry = async () => page([entry(1, { remotes: [{ type: 'streamable-http', url: URL }] })]);
  const net = network({ [REGISTRY]: registry, [HOST]: server.fetch });
  const captures = [];
  const f = fixture(t, net.fetch, {
    onCommittedRepresentativeHandshake: async (capture) => {
      captures.push({ capture, committed: { result: f.check(1).result, toolsSha256: f.check(1).tools_sha256, level: f.sql.prepare('SELECT level FROM noah_intake_families WHERE id=?').get(ID).level } });
    },
  });
  await f.store.sync();
  await f.store.probeDue(f.time() + 25_000);
  assert.equal(captures.length, 1);
  assert.deepEqual(captures[0].committed, { result: 'ok', toolsSha256: captures[0].capture.toolsSha256, level: 1 });
  assert.deepEqual(captures[0].capture.tools[0].outputSchema, outputSchema);
  assert.equal(Object.hasOwn(captures[0].capture.tools[0], 'readOnly'), true, 'the hook sees the complete normalized definition');
  assert.equal(Object.hasOwn(f.check(1), 'outputSchema'), false, 'raw definitions are not stored in the production-shaped row');
});
