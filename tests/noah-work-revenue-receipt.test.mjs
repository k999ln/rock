import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixtures/noah/intake.mjs';
import { createNoahAskApi } from '../lib/noah-ask.ts';
import { createNoahWorkRevenueApi } from '../lib/noah-work-revenue-api.ts';
import { OWNER_SCOPE_HEADER, ownerScopeFor } from '../lib/owner-intent.ts';
import { createReceiptSignature } from '../lib/receipt-signature.ts';
import { parseNoahFlags } from '../lib/noah-flags.ts';
import { createNoahRemoteWork, finishNoahRemoteWork } from '../lib/noah-remote-work.ts';
import { noahWorkRevenueReceipt } from '../lib/noah-work-revenue-receipt.ts';

const work = {
  combinationId: 'affiliate:ai-tools:blog', version: 1,
  author: { kind: 'person', id: 'author' }, authorRelation: 'other',
};
const amount = (stage, amountYen, reference) => ({ stage, amountYen, reference, source: 'issuer-for-this-work' });
const approved = amount('approved', 8_000, 'approval-a');
const paid = amount('paid', 8_000, 'deposit-a');
const cost = amount('cost', 1_000, 'complete-expenses');
const read = (receipts, overrides = {}) => noahWorkRevenueReceipt({ ...work, receipts, ...overrides }, 'operator');

void test('Work shows actual approval, deposit and complete costs independently; opening a receipt cannot expose issuer references', () => {
  const waiting = read([]);
  assert.deepEqual(waiting, { approvedYen: null, paidYen: null, costYen: null, shareBps: 2000, authorShareYen: null, authorShareStatus: 'pending-payment' });
  assert.deepEqual(read([approved, cost]), { ...waiting, approvedYen: 8_000, costYen: 1_000 });
  assert.deepEqual(read([approved, paid]), { ...waiting, approvedYen: 8_000, paidYen: 8_000, authorShareStatus: 'pending-cost' });
  const confirmed = read([approved, paid, cost, paid]);
  assert.deepEqual(confirmed, { approvedYen: 8_000, paidYen: 8_000, costYen: 1_000, shareBps: 2000, authorShareYen: 1_400, authorShareStatus: 'confirmed' });
  assert.equal(read([approved, paid, amount('cost', 0, 'free')]).authorShareYen, 1_600);
  assert.equal(read([approved, paid, amount('cost', 8_500, 'loss')]).authorShareYen, 0);
  const zero = read([amount('approved', 0, 'a'), amount('paid', 0, 'p'), cost]);
  assert.deepEqual([zero.approvedYen, zero.paidYen, zero.authorShareYen, zero.authorShareStatus], [0, 0, 0, 'confirmed']);
});

void test('ambiguous author identity, owner as author, conflicting receipts or an unsafe total never produce a confirmed creator amount', () => {
  for (const receipts of [[paid, cost, {...cost, amountYen: 5}], [cost, paid, {...cost, reference:'second-total'}],
    [cost, paid, amount('paid', Number.MAX_SAFE_INTEGER,'overflow')], [approved, {...paid, amountYen: -10}]]) {
    assert.equal(read(receipts).authorShareStatus, 'unresolved');
    assert.equal(read(receipts).authorShareYen, null);
  }
  const receipts = [approved, paid, cost];
  assert.equal(read(receipts, { authorRelation:'self' }).authorShareStatus, 'not-applicable');
  // Catalog handles and login subjects are different namespaces. Only an attested mapping can identify self-use.
  assert.equal(read(receipts, { author: {kind:'person',id:'operator'}, authorRelation:'other' }).authorShareYen, 1_400);
  assert.equal(read(receipts, { author: {kind:'person',id:'operator'}, authorRelation:'unknown' }).authorShareYen, null);
  const unknown = read(receipts, { authorRelation:'unknown' });
  assert.deepEqual([unknown.approvedYen, unknown.paidYen, unknown.costYen, unknown.authorShareStatus, unknown.authorShareYen],
    [8_000, 8_000, 1_000, 'unresolved', null]);
});

void test('the signed-in owner reads only the selected saved provider Work; public provider output cannot create a revenue receipt', async t => {
  const db = fixture(t);
  let owner = 'operator';
  const api = createNoahAskApi({ ...db.deps, authenticate: async () => owner, reviewers: [],
    providerDirectory: async () => { throw Error('A saved result must not start a provider'); },
    flags: parseNoahFlags({}) });
  const get = async id => api.item(new Request('https://noah.test/api/noah/ask/' + id), id);
  function save(user, financial) {
    const id = crypto.randomUUID(), tool = 'result';
    const job = createNoahRemoteWork(id, {
      connectionId: id, familyKey: 'provider-a', digest: 'a'.repeat(64), agentName: 'Provider',
      host: 'provider.test', tool, toolSha256: 'b'.repeat(64), toolsSha256: 'c'.repeat(64), args: {}, inputSha256: 'd'.repeat(64),
    }, db.time());
    job.noahRemote.provider = { protocol: 'mcp', projectId: 'provider-a', origin: 'https://provider.test/mcp', api: tool };
    const stored = finishNoahRemoteWork(job, { state: 'returned', result: { text: 'This unaudited text claims 99,999 yen.', attachments: 0, truncated: false }, note: '', used: [tool] }, db.time());
    if (financial) stored.noahRevenue = { ...work, schema: 'noah-work-revenue/1', receipts: financial,
      target: { familyKey: 'provider-a', endpoint: 'https://provider.test/mcp', tool }, issuer: 'issuer-for-this-work' };
    db.sql.prepare('INSERT INTO work_jobs(id,user_id,payload,revision,updated_at) VALUES(?,?,?,?,?)')
      .run(id, user, JSON.stringify(stored), stored.revision, stored.updatedAt);
    return id;
  }
  const id = save('operator', [approved, paid, cost]);
  const old = save('operator', null);
  const unrelated = save('another-owner', [amount('paid', 100_000, 'private-bank-reference')]);
  for (let n = 0; n < 2; n++) {
    const response = await get(id);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const body = await response.json();
    assert.equal(body.result.text, 'This unaudited text claims 99,999 yen.');
    assert.deepEqual(body.revenueReceipt, { ...read([approved, paid, cost]), evidenceConnection: 'unconfigured' });
    assert.doesNotMatch(JSON.stringify(body), /issuer-for-this-work|deposit-a|private-bank-reference/);
  }
  assert.equal((await (await get(old)).json()).revenueReceipt, undefined);
  assert.equal((await get(unrelated)).status, 404);
  owner = 'another-owner';
  assert.equal((await get(id)).status, 404);
});

void test('a real operator tracking Work remains one owner-only result while approval, deposit and final cost arrive', async t => {
  const db = fixture(t);
  let owner = 'operator';
  const config = { providerId: 'test-evidence-issuer', secret: 'test-only-work-receipt-secret-padded',
    authorOwners: { noellesugar99: 'author' }, operatorAccounts: { operator: 'account-at-issuer' } };
  const deps = { ...db.deps, authenticate: async () => owner, reviewers: [], revenueConfig: config, flags: parseNoahFlags({}) };
  const workApi = createNoahWorkRevenueApi(deps);
  const asks = createNoahAskApi(deps);
  const origin = 'https://noah.test';
  const body = JSON.stringify({ combinationId: work.combinationId, requestId: crypto.randomUUID() });
  const start = async () => workApi.start(new Request(origin + '/api/noah/revenue/work', { method: 'POST', body,
    headers: { origin, 'content-type': 'application/json', [OWNER_SCOPE_HEADER]: await ownerScopeFor(owner) } }));
  const created = await start();
  assert.equal(created.status, 201);
  const { workId } = await created.json();
  assert.equal((await (await start()).json()).workId, workId);
  const get = () => asks.item(new Request(origin + '/api/noah/ask/' + workId), workId);
  const readReceipt = async () => {
    const response = await get();
    assert.equal(response.status, 200);
    const detail = await response.json();
    assert.equal(detail.id, workId);
    assert.equal(detail.mode, 'revenue');
    assert.equal(typeof detail.result.text, 'string');
    return detail.revenueReceipt;
  };
  async function deliver(stage, source, amountYen) {
    const raw = JSON.stringify({ schema: 'noah-revenue-receipt/1', providerId: config.providerId, workId,
      combinationId: work.combinationId, version: work.version, stage, source, amountYen, currency: 'JPY',
      reference: 'external-' + stage, observedAt: db.time(), evidenceSha256: 'd'.repeat(64), operatorRef: 'account-at-issuer' });
    const signature = await createReceiptSignature(raw, config.secret, Math.floor(db.time()/1000));
    const response = await workApi.receipt(new Request(origin + '/api/noah/revenue/receipts', {
      method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'avocado-provider-signature': signature } }));
    assert.equal(response.ok, true, await response.text());
  }
  const list = async suffix => (await (await asks.collection(new Request(origin + '/api/noah/ask' + suffix))).json()).asks;
  assert.deepEqual((await list('')).map(row => row.id), [workId]);
  assert.deepEqual((await list('?agent=' + encodeURIComponent(work.combinationId))).map(row => row.id), [workId]);
  assert.deepEqual(await list('?agent=unrelated'), []);
  assert.equal((await list(''))[0].revenueReceipt, undefined);
  assert.deepEqual(await readReceipt(), { ...read([]), evidenceConnection: 'connected' });
  await deliver('approved', 'asp-approval', 8000);
  assert.deepEqual(await readReceipt(), { ...read([approved]), evidenceConnection: 'connected' });
  await deliver('paid', 'bank-deposit', 8000);
  assert.deepEqual(await readReceipt(), { ...read([approved, paid]), evidenceConnection: 'connected' });
  await deliver('cost', 'final-work-cost', 1000);
  assert.deepEqual(await readReceipt(), { ...read([approved, paid, cost]), evidenceConnection: 'connected' });
  config.secret = undefined;
  assert.deepEqual(await readReceipt(), { ...read([approved, paid, cost]), evidenceConnection: 'unconfigured' });
  owner = 'unrelated-owner';
  assert.deepEqual(await list(''), []);
  assert.equal((await get()).status, 404);
});
