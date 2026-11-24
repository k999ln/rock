import test from 'node:test';
import assert from 'node:assert/strict';
import { screen } from './fixtures/noah/screen.mjs';
import * as askView from '../lib/noah-ask-view.ts';
import { fixture } from './fixtures/noah/intake.mjs';
import { createNoahAskApi } from '../lib/noah-ask.ts';
import { createNoahWorkRevenueApi } from '../lib/noah-work-revenue-api.ts';
import { createReceiptSignature } from '../lib/receipt-signature.ts';
import { noahRevenueConfig } from '../lib/noah-revenue-operation.ts';
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
  assert.equal(w.state.calls[0]._meta, undefined);
  assert.deepEqual(w.state.calls[0].arguments, { text: 'hello', zones: ['Asia/Tokyo', 'UTC'] });
  assert.equal(await fresh.get('owner-b', input.id), null);
  assert.equal((await fresh.accept('owner-a', false, input)).replay, true); assert.equal(w.state.calls.length, 1);
  assert.equal((await fresh.list('owner-a')).length, 1);
});
void test('only the registered revenue tool gets its dispatch proof and signed receipts update that same private Work', async t => {
  const w = setup(t), combinationId = 'affiliate:ai-tools:blog', operator = 'verified-operator-a';
  w.deps.revenueConfig = noahRevenueConfig({
    NOAH_REVENUE_PROVIDER_ID: 'reviewed-provider', NOAH_REVENUE_PROVIDER_SECRET: 't'.repeat(48),
    NOAH_REVENUE_OPERATOR_ACCOUNTS: JSON.stringify({ 'owner-a': operator, 'another-owner': 'verified-operator-b' }),
    NOAH_REVENUE_AUTHOR_OWNERS: JSON.stringify({ noellesugar99: 'different-author' }),
    NOAH_REVENUE_PROVIDER_TARGET: JSON.stringify({ familyKey: projectId, endpoint: target, tool: 'convert', combinationId }),
  });
  const input = await w.input();
  const ownerScope = await ownerScopeFor('owner-a');
  const provider = createNoahProviderApi(w.deps);
  const run = await provider(new Request('https://noah.test/api/noah/provider', {
    method: 'POST', body: JSON.stringify(input),
    headers: { origin: 'https://noah.test', 'content-type': 'application/json', [OWNER_SCOPE_HEADER]: ownerScope },
  }));
  assert.equal(run.status, 202);
  assert.equal((await run.json()).id, input.id);
  const meta = w.state.calls[0]._meta['avoado.si/revenue-work'];
  assert.deepEqual(Object.keys(meta).sort(), ['combinationId', 'dispatchProof', 'version', 'workId']);
  assert.equal(meta.workId, input.id);
  assert.equal(meta.combinationId, combinationId);
  assert.ok(meta.dispatchProof.length >= 32);
  const got = await w.runtime.get('owner-a', input.id);
  assert.equal(got.noahRevenue.version, meta.version);
  assert.equal(got.noahRemote.state, 'returned');
  assert.ok(!JSON.stringify(got).includes(meta.dispatchProof));

  const receipts = createNoahWorkRevenueApi(w.deps);
  const path = 'https://noah.test/api/noah/ask/' + input.id;
  const ask = createNoahAskApi(w.deps);
  const listing = await ask.collection(new Request('https://noah.test/api/noah/ask'));
  assert.equal(listing.status, 200);
  const saved = await listing.json();
  assert.equal(saved.ownerScope, ownerScope);
  assert.deepEqual(saved.asks.map(item => item.id), [input.id]);
  const ui = screen({ modules: { '@/lib/owner-intent': { OWNER_SCOPE_HEADER }, '@/lib/noah-ask-view': askView }, fetch: async ({ method, url }) => {
    assert.deepEqual([method, url], ['GET', new URL(path).pathname]);
    const response = await ask.item(new Request(path), input.id);
    return { status: response.status, body: await response.json() };
  } });
  const page = ui.mount('components/noah-task-detail.tsx', { id: input.id });
  await page.flush();
  assert.match(page.text(), /成果承認額承認記録なし入金額入金記録なし/);
  async function privateReceipt() {
    const response = await ask.item(new Request(path), input.id);
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.id, input.id);
    assert.match(detail.result.text, /Official provider result/);
    assert.equal(detail.revenueReceipt.evidenceConnection, 'connected');
    assert.ok(!JSON.stringify(detail).includes(meta.dispatchProof));
    return detail.revenueReceipt;
  }
  async function submit(stage, source, amountYen, operatorRef = operator, expectedStatus = 201) {
    w.f.advance(1000);
    const raw = JSON.stringify({
      schema: 'noah-revenue-receipt/1', ...meta, providerId: 'reviewed-provider', operatorRef, stage, source,
      amountYen, currency: 'JPY', reference: 'fixture/' + stage, observedAt: w.f.time(), evidenceSha256: 'b'.repeat(64),
    });
    const signature = await createReceiptSignature(raw, w.deps.revenueConfig.secret, Math.floor(w.f.time() / 1000));
    const response = await receipts.receipt(new Request('https://noah.test/api/noah/revenue/receipts', {
      method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'avocado-provider-signature': signature },
    }));
    assert.equal(response.status, expectedStatus, await response.text());
    await page.tick(15000);
    return privateReceipt();
  }
  const stages = r => [r.approvedYen, r.paidYen, r.costYen, r.authorShareStatus, r.authorShareYen];
  assert.deepEqual(stages(await privateReceipt()), [null, null, null, 'pending-payment', null]);
  assert.deepEqual(stages(await submit('approved', 'asp-approval', 8000, 'verified-operator-b', 404)),
    [null, null, null, 'pending-payment', null]);
  assert.match(page.text(), /成果承認額承認記録なし入金額入金記録なし/);
  assert.deepEqual(stages(await submit('approved', 'asp-approval', 8000)), [8000, null, null, 'pending-payment', null]);
  assert.match(page.text(), /成果承認額[￥¥]8,000入金額入金記録なし/);
  assert.deepEqual(stages(await submit('paid', 'bank-deposit', 8000)), [8000, 8000, null, 'pending-cost', null]);
  assert.match(page.text(), /入金額[￥¥]8,000この仕事の費用未確定作者の取り分（20%）未確定/);
  assert.deepEqual(stages(await submit('cost', 'final-work-cost', 1000)), [8000, 8000, 1000, 'confirmed', 1400]);

  assert.match(page.text(), /この仕事の費用[￥¥]1,000作者の取り分（20%）確定（[￥¥]1,400）/);
  const other = createNoahAskApi({ ...w.deps, authenticate: async () => 'another-owner' });
  const denied = await other.item(new Request(path), input.id);
  assert.equal(denied.status, 404);
  assert.equal((await denied.json()).revenueReceipt, undefined);
  assert.equal((await w.runtime.accept('owner-a', false, input)).replay, true);
  assert.equal(w.state.calls.length, 1);
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
