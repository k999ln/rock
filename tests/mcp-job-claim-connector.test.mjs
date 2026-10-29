import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSkyToolApp } from '../toolkits/sky-tool-sdk/src/index.mjs';
import { createConnector, McpHub } from '../toolkits/sky-mcp-connector/server.mjs';

void test('connector claims one saved job at the authority before calling its Tool', { timeout: 20_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'rock-connector-claim-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0, mode = 'reject', claims = 0, expectedContext = null;
  const authority = createServer(async (req, res) => {
    claims++;
    if (mode === 'redirect') { res.writeHead(302, { Location: '/unexpected' }); return res.end(); }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    assert.equal(req.url, '/api/work-jobs/tool-observations/claim');
    assert.equal(input.transport, 'local_http');
    if (expectedContext) { assert.deepEqual(input.executionContext, expectedContext); assert.equal(input.executionReviewDigest, 'd'.repeat(64)); }
    else { assert.equal(Object.keys(input).length, 12); assert.equal(input.executionContext, undefined); }
    assert.match(input.inputSchemaSha256, /^[a-f0-9]{64}$/);
    assert.match(input.outputSchemaSha256, /^[a-f0-9]{64}$/);
    assert.notEqual(input.inputSha256, input.inputSchemaSha256);
    if (mode === 'reject') { res.writeHead(409); return res.end('{}'); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ claimed: true, jobId: input.jobId, attemptId: input.attemptId,
      ...(input.executionReviewDigest ? { executionReviewDigest: mode === 'review-mismatch' ? 'e'.repeat(64) : input.executionReviewDigest } : {}),
      inputSha256: mode === 'mismatch' ? 'a'.repeat(64) : input.inputSha256, jobRevision: 4 }));
  });
  await new Promise(resolve => authority.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => authority.close(resolve)));
  const origin = `http://127.0.0.1:${authority.address().port}`;
  const sdk = createSkyToolApp({ developer: { id: 'fixture', name: 'Fixture', supportUrl: 'https://example.invalid' },
    app: { id: 'com.example.claim', name: 'Fixture', version: '1.0.0', sourceUrl: 'https://example.invalid', license: 'MIT' },
    registration: false, autoPublish: false, localToolDirectory: join(dir, 'discovery') });
  sdk.tool({ name: 'echo_fixture', title: 'Fixture', description: 'Test-only deterministic operation',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    outputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
    sideEffects: ['none'], price: { model: 'free', note: 'fixture' }, handler: async ({ text }) => { calls++; return { text }; } });
  const tool = await sdk.start(); t.after(() => tool.close());
  const registryPath = join(dir, 'registry.json'); await writeFile(registryPath, JSON.stringify({ schema: 'rockstaros-mcp-registry/1', servers: [] }));
  const connector = await createConnector({ registryPath, port: 0, localToolDirectory: join(dir, 'discovery'), allowedOrigins: new Set([origin]) });
  t.after(() => new Promise(resolve => connector.server.close(resolve)));
  const base = `http://127.0.0.1:${connector.port}`, headers = { Origin: origin, Host: `127.0.0.1:${connector.port}`, 'Content-Type': 'application/json' };
  const auth = (await (await fetch(`${base}/connect`, { method: 'POST', headers, body: '{}' })).json()).token;
  const call = (path, body) => fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, Authorization: `Bearer ${auth}` }, body: JSON.stringify(body) });
  await fetch(`${base}/servers`, { headers: { ...headers, Authorization: `Bearer ${auth}` } });
  assert.equal((await call(`/servers/${tool.localId}/connect`, {})).status, 200);
  const args = { text: 'synthetic' }, jobGate = { jobId: randomUUID(), attemptId: randomUUID(), agentId: randomUUID(),
    agentRevision: 1, ownerScope: `owner-v1:${'a'.repeat(64)}`, token: 'T'.repeat(43) };
  async function prepared() { return (await (await call(`/servers/${tool.localId}/prepare`, { name: 'echo_fixture', arguments: args })).json()).approvalToken; }
  async function execute(approvalToken, gate = jobGate) { return call(`/servers/${tool.localId}/execute`, { name: 'echo_fixture', arguments: args, approvalToken, confirmed: true, jobGate: gate }); }
  const rejectedApproval = await prepared(); assert.equal((await execute(rejectedApproval)).status, 409); assert.equal(calls, 0);
  assert.notEqual((await execute(rejectedApproval)).status, 200); assert.equal(claims, 1);
  mode = 'mismatch'; assert.equal((await execute(await prepared())).status, 409); assert.equal(calls, 0);
  mode = 'redirect'; assert.equal((await execute(await prepared())).status, 409); assert.equal(calls, 0);
  mode = 'ok'; const response = await execute(await prepared()); assert.equal(response.status, 200);
  const result = await response.json(); assert.equal(calls, 1); assert.equal(result.jobClaim.jobId, jobGate.jobId);
  assert.equal(result.jobClaim.inputSha256, createHash('sha256').update(JSON.stringify(args)).digest('hex'));
  assert.equal(result.jobClaim.jobRevision, 4); assert.ok(!JSON.stringify(result).includes(jobGate.token));
  const prepareReview = async () => (await (await call(`/servers/${tool.localId}/prepare`, { name:'echo_fixture', arguments:args })).json());
  const reviewed = await prepareReview(); expectedContext = reviewed.executionContext;
  assert.equal(expectedContext.inputSha256, createHash('sha256').update(JSON.stringify(args)).digest('hex'));
  assert.equal(expectedContext.pricing.declaration, 'provider_unverified');
  const reviewedGate = { ...jobGate, executionReviewDigest:'d'.repeat(64) };
  mode = 'review-mismatch'; assert.equal((await execute(reviewed.approvalToken, reviewedGate)).status, 409); assert.equal(calls, 1);
  mode = 'ok'; const next = await prepareReview(); expectedContext = next.executionContext;
  const response2 = await execute(next.approvalToken, reviewedGate); assert.equal(response2.status, 200);
  assert.equal((await response2.json()).jobClaim.executionReviewDigest, reviewedGate.executionReviewDigest);
  assert.equal(calls, 2); assert.notEqual((await execute(next.approvalToken, reviewedGate)).status, 200); assert.equal(calls, 2);

});

void test('claim await cannot reuse approval across same-digest reconnect or unknown response', async () => {
  for (const mode of ['reconnect', 'unknown']) {
    const hub = new McpHub([{ id:'fixture',name:'Fixture',transport:'stdio', command:'unused-fixture',args:[] }]);
    let calls = 0;
    hub.entry('fixture').transport = { protocol:null, reset() {}, close() {}, async request(message) {
      if (!('id' in message)) return null;
      const result = message.method === 'initialize' ? { protocolVersion:'2025-11-25',serverInfo:{name:'fixture',version:'1'} }
        : message.method === 'tools/list' ? { tools:[{ name:'count',inputSchema:{type:'object'},outputSchema:{type:'object'},
          _meta:{'rockstaros.dev/pricing':{model:'free',note:'provider fixture'}} }] }
        : (++calls, { counted:true });
      return { jsonrpc:'2.0',id:message.id,result };
    } };
    const original = await hub.connect('fixture');
    const prepared = hub.prepare('fixture','count',{});
    await assert.rejects(hub.execute('fixture','count',{},prepared.approvalToken,true, async contract => {
      assert.deepEqual(contract.executionContext, prepared.executionContext);
      if (mode === 'unknown') throw new Error('fixture claim response unknown');
      const current = await hub.connect('fixture'); assert.equal(current.toolDigest, original.toolDigest);
    }));
    assert.equal(calls, 0);
    await assert.rejects(hub.execute('fixture','count',{},prepared.approvalToken,true));
    assert.equal(calls, 0); hub.close();
  }
});
