import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/noah/intake.mjs';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { createNoahProviderRuntime } from '../lib/noah-provider-runtime.ts';
import { createNoahProviderApi } from '../lib/noah-provider-api.ts';
import { ownerScopeFor, OWNER_SCOPE_HEADER } from '../lib/owner-intent.ts';
const projectId = 'project-' + 'b'.repeat(64), target = 'https://provider.example.com/mcp';
function setup(t, patch = {}) {
  const state = { calls: [], handshakes: 0, tools: 0, ...patch };
  const tool = () => ({ name: 'convert', description: state.description ?? 'Convert', inputSchema: { type: 'object', properties: { text: { type: 'string' }, zones: { type: 'array', items: { type: 'string' }, maxItems: 3 } }, required: ['text'], additionalProperties: false }, annotations: { readOnlyHint: true } });
  const fetcher = async (url, init = {}) => {
    assert.equal(init.redirect, 'manual');
    if (String(url).startsWith('https://raw.githubusercontent.com/')) return Response.json({ name: 'io.github.maker/agent', remotes: [{ type: 'streamable-http', url: target }] });
    assert.equal(String(url), target);
    if (init.method === 'DELETE') return new Response(null, { status: 204 });
    const body = JSON.parse(init.body);
    if (body.method === 'initialize') { state.handshakes++; return Response.json({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'Public Agent', version: '1' } } }); }
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    if (body.method === 'tools/list') { state.tools++; await state.onTools?.(); return Response.json({ jsonrpc: '2.0', id: body.id, result: { tools: [tool()] } }); }
    assert.equal(body.method, 'tools/call'); state.calls.push(body.params); await state.onCall?.();
    if (state.lost) throw Error('lost after send');
    return Response.json({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'Official provider result' }] } });
  };
  const f = fixture(t, fetcher), deps = { ...f.deps, flags: parseNoahFlags({ NOAH_INTAKE_PUBLIC: 'true', NOAH_ASK_FORM: 'true' }), reviewers: [], authenticate: async () => 'owner-a', providerDirectory: async () => [{ card: { id: projectId, feedbackId: projectId, name: 'Agent', href: 'https://github.com/maker/agent', sources: [] }, families: [] }] };
  const runtime = createNoahProviderRuntime(deps);
  const input = async () => ({ id: crypto.randomUUID(), projectId, api: 'convert', digest: (await runtime.plan(projectId)).endpoints[0].digest, input: { text: 'hello', zones: 'Asia/Tokyo\nUTC' }, confirm: true });
  return { state, f, deps, runtime, input };
}
void test('MCP metadata creates a form, sends once, and persists real SQLite Work across runtime instances', async t => {
  const w = setup(t), input = await w.input();
  assert.equal(w.state.calls.length, 0);
  const accepted = await w.runtime.accept('owner-a', false, input); await accepted.run();
  const fresh = createNoahProviderRuntime(w.deps), job = await fresh.get('owner-a', input.id);
  assert.equal(job.noahRemote.state, 'returned'); assert.match(job.noahRemote.result.text, /Official provider/);
  assert.deepEqual(w.state.calls[0].arguments, { text: 'hello', zones: ['Asia/Tokyo', 'UTC'] });
  assert.equal(await fresh.get('owner-b', input.id), null);
  assert.equal((await fresh.accept('owner-a', false, input)).replay, true); assert.equal(w.state.calls.length, 1);
  assert.equal((await fresh.list('owner-a')).length, 1);
});
void test('changed tool descriptions and stop during the last handshake prevent dispatch', async t => {
  for (const mode of ['changed', 'stopped']) {
    const w = setup(t), input = await w.input(), accepted = await w.runtime.accept('owner-a', false, input);
    w.state.onTools = async () => {
      if (w.state.tools !== 4) return;
      if (mode === 'changed') w.state.description = 'Changed tool';
      else { const job = await w.runtime.get('owner-a', input.id); await w.runtime.stop('owner-a', input.id, job.revision); }
    };
    await accepted.run(); assert.equal(w.state.calls.length, 0, mode);
    assert.equal((await w.runtime.get('owner-a', input.id)).noahRemote.state, mode === 'changed' ? 'failed' : 'cancelled');
  }
});
void test('lost MCP response stays unknown and repeated requests never send twice', async t => {
  const w = setup(t, { lost: true }), input = await w.input(), accepted = await w.runtime.accept('owner-a', false, input);
  await accepted.run(); assert.equal((await w.runtime.get('owner-a', input.id)).noahRemote.state, 'unknown');
  assert.equal((await w.runtime.accept('owner-a', false, input)).replay, true); assert.equal(w.state.calls.length, 1);
});
void test('MCP POST keeps its response open until saved, checks Origin and owner scope', async t => {
  const w = setup(t), input = await w.input(), api = createNoahProviderApi(w.deps), scope = await ownerScopeFor('owner-a');
  const request = origin => new Request('https://noah.test/api/noah/provider', { method: 'POST', headers: { origin, 'content-type': 'application/json', [OWNER_SCOPE_HEADER]: scope }, body: JSON.stringify(input) });
  assert.equal((await api(request('https://other.test'))).status, 403); assert.equal(w.state.calls.length, 0);
  let release; w.state.onCall = () => new Promise(r => { release = r; });
  const response = await api(request('https://noah.test')); assert.equal(response.status, 202);
  const body = response.json(); let done = false; void body.then(() => { done = true; });
  while (!release) await new Promise(r => setTimeout(r, 1));
  assert.equal(done, false); release(); assert.equal((await body).state, 'succeeded');
  assert.equal((await w.runtime.get('owner-a', input.id)).noahRemote.state, 'returned');
});
