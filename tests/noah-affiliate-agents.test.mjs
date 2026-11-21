import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { validateCatalog, publicCatalog, consult, audit, draft, analyze, runAction } from '../toolkits/noah-affiliate-agents/core.mjs';
import worker, { handleMcp } from '../toolkits/noah-affiliate-agents/mcp.mjs';
import { bundles, manifest } from '../toolkits/noah-affiliate-agents/build.mjs';
import { readNoahArchive } from '../lib/noah-source-archive.ts';
import { sourceProject } from '../lib/noah-source-project.ts';
import { parseNoahAgentManifest } from '../lib/noah-agent-upload.ts';
import { noahMcpHandshake, noahMcpCall } from '../lib/noah-mouth-mcp-remote.ts';
import { terminalSource } from '../scripts/noah-terminal-runtime.mjs';

const now = Date.parse('2026-11-22T12:00:00Z');
const offer = patch => ({ id: 'synthetic-a', name: '合成サービスA', topic: 'website', description: '合成の紹介文。', sourceUrl: 'https://merchant.example/product',
  checkedAt: '2026-11-22', validUntil: '2026-11-29', status: 'active', partnership: 'partnered', channels: ['chat', 'web'],
  agentPlacementApproved: true, publicContentApproved: true, approvalReference: 'PRIVATE-APPROVAL', conditions: 'PRIVATE-CONDITIONS',
  affiliateUrl: 'https://www.rentracks.jp/adx/r.html?idx=0.1.2.3.4&dna=5', price: { amountYen: 5000, period: 'month' },
  commission: { unit: 'yen', amount: 987654321 }, privateMemo: 'PRIVATE-MEMO', ...patch });
const catalog = (offers = [offer()]) => ({ schema: 'noah-affiliate-catalog/1', version: 'test1', offers });
const input = { topic: 'website', channel: 'chat' };
const env = { CATALOG_JSON: JSON.stringify(catalog()), OPERATIONS_TOKEN: 'synthetic-test-only-token-123456789', NOAH_ORIGIN: 'https://avoado.si' };
const request = (role, method, args, headers = {}) => new Request(`https://agent.example/${role}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(args ? { params: args } : {}) }) });

await test('掲載条件の各不足・期限・未来日を独立に閉じる', () => {
  assert.equal(consult(input, catalog(), now).offers.length, 1);
  for (const patch of [{ status: 'paused' }, { partnership: 'unpartnered' }, { channels: ['web'] }, { agentPlacementApproved: false },
    { publicContentApproved: false }, { approvalReference: null }, { affiliateUrl: null }, { checkedAt: '2026-11-23' }, { validUntil: '2026-11-22' }]) {
    const at = patch.validUntil ? Date.parse('2026-11-23T00:00:00Z') : now;
    assert.equal(consult(input, catalog([offer(patch)]), at).offers.length, 0, JSON.stringify(patch));
    assert.equal(draft({ offerId: 'synthetic-a', channel: 'chat' }, catalog([offer(patch)]), at).readyForReview, false);
  }
});
await test('相談の投影・応答に運営情報を含めず報酬で順位を変えない', () => {
  const c = catalog([offer({ id: 'b', price: { amountYen: 5000, period: 'month', memo: 'PRIVATE-PRICE' } }), offer({ id: 'a', commission: { unit: 'yen', amount: 1 } })]);
  const first = consult(input, c, now);
  c.offers[1].commission.amount = 999999999;
  assert.deepEqual(consult(input, c, now), first);
  for (const value of [first, publicCatalog(c, now)]) assert.doesNotMatch(JSON.stringify(value), /PRIVATE-|commission|987654321|999999999/);
  assert.equal(first.offers[0].id, 'a');
  assert.throws(() => runAction('consult', { action: 'audit' }, c, now));
  assert.throws(() => runAction('consult', { action: 'consult', ...input, offers: c.offers }, c, now));
});
await test('予算の期間と価格未確認を分ける', () => {
  const c = catalog([offer(), offer({ id: 'b', price: null }), offer({ id: 'c', price: { amountYen: 10, period: 'once' } })]);
  assert.equal(consult({ ...input, budgetYen: 4000, budgetPeriod: 'month' }, c, now).offers.length, 0);
  assert.equal(consult({ ...input, budgetYen: 5000, budgetPeriod: 'month' }, c, now).offers.length, 1);
  assert.throws(() => consult({ ...input, budgetYen: 100 }, c, now));
  assert.equal(consult(input, catalog([]), now).freeSteps.length, 2);
});
await test('不正URL・重複ID・不正日付・過剰期限を拒否', () => {
  for (const patch of [{ affiliateUrl: 'javascript:alert(1)' }, { affiliateUrl: 'https://merchant.example/' },
    { affiliateUrl: 'https://www.rentracks.jp/adx/r.html?idx=0.1.2.3.4&dna=5&dna=6' }, { checkedAt: '2026-02-30' }, { validUntil: '2027-11-01' }]) assert.throws(() => validateCatalog(catalog([offer(patch)])));
  assert.throws(() => validateCatalog(catalog([offer(), offer()])));
});
await test('運営点検と下書きが不足条件を示し公開済みと呼ばない', () => {
  const c = catalog([offer({ agentPlacementApproved: false })]);
  assert.equal(audit(c, now).offers[0].commission.amount, 987654321);
  assert.match(audit(c, now).offers[0].channels.chat.join(), /agent/);
  const blocked = draft({ offerId: 'synthetic-a', channel: 'chat' }, c, now);
  assert.doesNotMatch(blocked.text, /rentracks|合成サービス|PRIVATE/);
  const ready = draft({ offerId: 'synthetic-a', channel: 'chat' }, catalog(), now);
  assert.equal(ready.status, 'draft'); assert.match(ready.text, /広告・公開前/);
});
await test('承認率の分母は確定分だけ、未入金とゼロ分母と個人情報を区別', () => {
  const base = { periodStart: '2026-11-01', periodEnd: '2026-11-22', rows: [] };
  assert.equal(analyze(base).approvalRate, null); assert.equal(analyze(base).approvedRevenuePerClickYen, null);
  const row = { offerId: 'a', clicks: 100, pending: 7, approved: 2, rejected: 3, pendingYen: 10000, approvedYen: 600 };
  const result = analyze({ ...base, rows: [row] });
  assert.equal(result.approvalRate, .4); assert.equal(result.approvedRevenuePerClickYen, 6); assert.equal(result.totals.approvedYen, 600);
  assert.throws(() => analyze({ ...base, rows: [row, row] }));
  assert.throws(() => analyze({ ...base, rows: [{ ...row, email: 'person@example.com' }] }));
});
await test('MCPの運営認証・道具分離・Origin・容量・入力の権限上書きを拒否', async () => {
  assert.equal((await handleMcp(request('operations', 'tools/list'), env, now)).status, 401);
  assert.equal((await handleMcp(request('operations', 'tools/list', null, { authorization: 'Bearer wrong' }), env, now)).status, 401);
  assert.equal((await handleMcp(request('consult', 'tools/list', null, { origin: 'https://evil.example' }), env, now)).status, 403);
  assert.equal((await handleMcp(request('consult', 'tools/list', null, { 'content-length': '999999' }), env, now)).status, 413);
  const denied = await (await handleMcp(request('consult', 'tools/call', { name: 'audit', arguments: {} }), env, now)).json();
  assert.equal(denied.error.code, -32602);
  const spoof = await (await handleMcp(request('consult', 'tools/call', { name: 'consult', arguments: { ...input, action: 'audit' } }), env, now)).json();
  assert.equal(spoof.result.isError, true); assert.doesNotMatch(JSON.stringify(spoof), /PRIVATE|987654321/);
  const malformed = new Request('https://agent.example/consult/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal((await (await handleMcp(malformed, env, now)).json()).error.code, -32700);
  const oversized = await handleMcp(request('consult', 'tools/call', { name: 'consult', arguments: input }), { ...env, CATALOG_JSON: env.CATALOG_JSON + ' '.repeat(5000) }, now);
  assert.equal((await oversized.json()).result.isError, true);
});
await test('Noahの実MCP clientで初期化・道具一覧・相談/運営呼出が通る', async () => {
  for (const role of ['consult', 'operations']) {
    const ctx = { fetch: (url, init) => handleMcp(new Request(url, init), env, now), ...(role === 'operations' ? { headers: async () => ({ Authorization: `Bearer ${env.OPERATIONS_TOKEN}` }) } : {}) };
    const hello = await noahMcpHandshake(`https://agent.example/${role}/mcp`, ctx);
    assert.deepEqual(hello.tools.map(t => t.name), role === 'consult' ? ['consult'] : ['audit', 'draft', 'analyze']);
    assert.equal(hello.allReadOnly, true);
    const result = await noahMcpCall(hello.session, role === 'consult' ? 'consult' : 'audit', role === 'consult' ? input : {}, ctx);
    assert.equal(result.ok, true); assert.equal(JSON.parse(result.blocks[0].text).offers.length, 1);
    if (role === 'consult') assert.doesNotMatch(JSON.stringify(result), /PRIVATE|commission|987654321/);
  }
});
await test('Worker fetchの第3引数が期限検査を壊さない', async () => {
  const old = catalog([offer({ checkedAt: '2000-01-01', validUntil: '2000-01-02' })]);
  const r = await worker.fetch(request('consult', 'tools/call', { name: 'consult', arguments: input }), { ...env, CATALOG_JSON: JSON.stringify(old) }, { waitUntil() {} });
  assert.equal(JSON.parse((await r.json()).result.content[0].text).offers.length, 0);
});
await test('2つのZIPをNoahで検査し固定テスト・端末protocol・成果hashを実行', async () => {
  for (const bundle of await bundles(catalog(), now)) {
    const project = await sourceProject(`${bundle.manifest.id}.zip`, bundle.zip);
    assert.deepEqual(project.tests, ['agent.test.mjs']);
    assert.equal(parseNoahAgentManifest(bundle.manifest).runtime.model, 'none');
    assert.equal((await terminalSource(`${bundle.manifest.id}.zip`, bundle.zip, bundle.sha256, bundle.manifest.runtime)).entry, 'main.mjs');
    const files = readNoahArchive(bundle.zip);
    const cat = files.find(f => f.name === 'catalog.json');
    if (bundle.role === 'consult') assert.doesNotMatch(new TextDecoder().decode(cat.bytes), /PRIVATE|commission|987654321/);
    const dir = await mkdtemp(join(tmpdir(), 'noah-affiliate-'));
    try {
      for (const f of files) await writeFile(join(dir, f.name), f.bytes);
      const tests = spawnSync(process.execPath, ['--test', 'agent.test.mjs'], { cwd: dir, encoding: 'utf8' });
      assert.equal(tests.status, 0, tests.stdout + tests.stderr);
      const result = spawnSync(process.execPath, ['main.mjs'], { cwd: dir, input: JSON.stringify({ schema: 'noah-terminal-input/1', prompt: bundle.role === 'consult' ? 'Webサイトを作りたい' : '{"action":"audit"}' }) + '\n', encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout); assert.equal(output.type, 'result'); assert.equal(output.files.length, 2);
      for (const f of output.files) { const bytes = Buffer.from(f.base64, 'base64'); assert.equal(bytes.length, f.bytes); assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256); }
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
await test('remote manifestは公開HTTPSのoriginだけで秘密を含まない', () => {
  const m = manifest('operations', 'https://agent.example/');
  assert.equal(m.adapter, 'mcp_http'); assert.equal(m.endpointUrl, 'https://agent.example/operations/mcp');
  assert.throws(() => manifest('consult', 'https://agent.example/?token=secret'));
  assert.throws(() => manifest('consult', 'http://localhost'));
});
