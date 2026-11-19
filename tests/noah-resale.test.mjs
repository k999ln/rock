import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import {
  candidate,
  createResaleJob,
  ingest,
  localAction,
  reserve,
  finish,
  totals,
} from '../lib/noah-resale.ts';
import { resaleService } from '../lib/noah-resale-service.ts';
import { ResaleBeforeDispatchError } from '../lib/noah-resale-provider.ts';
import {
  ebayResaleProvider,
  digest,
  minor,
} from '../lib/noah-resale-provider.ts';
import { DatabaseSync } from 'node:sqlite';
import { workStore } from '../lib/work-store.ts';
import { applyWorkCommand } from '../lib/workflow.ts';
function setup() {
  const s = createResaleJob(crypto.randomUUID()).resale;
  localAction(s, {
    action: 'configure',
    confirm: true,
    budget: 50000,
    perItemCap: 20000,
    currency: 'USD',
  });
  const i = candidate({
    role: 'street',
    externalId: 'v1|1|0',
    title: 'Hoodie',
    url: 'https://www.ebay.com/itm/1',
    currency: 'USD',
    price: 10000,
  });
  i.provider = 'ebay';
  i.assessment = {
    resalePrice: 20000,
    costs: 2000,
    floorProfit: 3000,
    evidence: 'synthetic comp',
  };
  i.checkout = {
    id: 'checkout',
    total: 11000,
    digest: 'd',
    expiresAt: Date.now() + 300000,
    summary: 'fixture',
  };
  s.items.push(i);
  return { s, i };
}
void test('full inventory lifecycle calculates fees, costs and refund losses, preserving corrections', () => {
  const { s, i } = setup();
  localAction(s, {
    action: 'record_purchase',
    itemId: i.id,
    confirm: true,
    total: 10000,
    reference: 'owner-order',
  });
  assert.equal(i.purchase.source, 'owner_reported');
  assert.throws(() =>
    localAction(s, {
      action: 'draft',
      itemId: i.id,
      price: 20000,
      images: [],
      conditionCode: 'USED_GOOD',
    }),
  );
  localAction(s, {
    action: 'receive',
    itemId: i.id,
    confirm: true,
    condition: 'used, seam repaired',
    notes: 'measurements checked',
  });
  localAction(s, {
    action: 'draft',
    itemId: i.id,
    price: 20000,
    images: [],
    conditionCode: 'USED_GOOD',
  });
  assert.match(i.listing.description, /seam repaired/);
  localAction(s, {
    action: 'record_listing',
    itemId: i.id,
    confirm: true,
    reference: 'listing',
  });
  const sale = {
    action: 'settlement',
    itemId: i.id,
    reference: 'sale',
    gross: 20000,
    fees: 2000,
    shipping: 1000,
    other: 500,
    refunds: 0,
  };
  localAction(s, sale);
  assert.equal(totals(s).reportedProfit, 6500);
  localAction(s, { ...sale, refunds: 20000 });
  assert.equal(totals(s).reportedProfit, -13500);
  assert.equal(i.settlementHistory.length, 1);
  assert.equal(totals(s).inventoryCost, 0);
});
void test('unknown purchase reserves budget across all roles and cannot be repeated or edited', () => {
  const { s, i } = setup();
  const op = crypto.randomUUID();
  reserve(s, i.id, 'purchase', op);
  finish(s, op, { error: 'timeout' });
  assert.equal(totals(s).reserved, 11000);
  assert.throws(() => reserve(s, i.id, 'purchase', crypto.randomUUID()));
  assert.throws(() =>
    localAction(s, {
      action: 'record_purchase',
      itemId: i.id,
      confirm: true,
      total: 1,
      reference: 'fake',
    }),
  );
  finish(s, op, { reference: 'provider-order' });
  assert.equal(totals(s).reserved, 0);
  assert.equal(totals(s).spent, 11000);
  assert.throws(() => finish(s, op, { reference: 'again' }));
});
void test('rejects exhausted budget, cap, weak margin, expired quote, pause and unsupported currency', () => {
  for (const change of [
    (s) => (s.budget = 100),
    (s) => (s.perItemCap = 100),
    (s) => (s.items[0].assessment.costs = 10000),
    (s) => (s.items[0].checkout.expiresAt = 0),
    (s) => (s.paused = true),
  ]) {
    const { s, i } = setup();
    change(s);
    assert.throws(() => reserve(s, i.id, 'purchase', crypto.randomUUID()));
  }
  assert.throws(() => minor('1.05', 'JPY'));
  assert.equal(minor('12.34', 'USD'), 1234);
  assert.throws(() => minor('NaN', 'USD'));
});
void test('duplicate discoveries retain inventory and do not reset purchase state', () => {
  const { s, i } = setup();
  reserve(s, i.id, 'purchase', crypto.randomUUID());
  ingest(s, [{ ...i, id: crypto.randomUUID(), status: 'candidate', price: 1 }]);
  assert.equal(s.items.length, 1);
  assert.equal(i.price, 10000);
});
function repo() {
  const rows = new Map();
  return {
    async get(owner, id) {
      return structuredClone(rows.get(owner + id) || null);
    },
    async create(owner, job) {
      if (!rows.has(owner + job.id))
        rows.set(owner + job.id, structuredClone(job));
      return this.get(owner, job.id);
    },
    async update(owner, job, revision) {
      if (rows.get(owner + job.id)?.revision !== revision) return false;
      rows.set(owner + job.id, structuredClone(job));
      return true;
    },
  };
}
void test('existing SQLite Work store restores resale, isolates owners and rejects general completion', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(
    'CREATE TABLE work_jobs(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,revision INTEGER,updated_at TEXT)',
  );
  const store = workStore({
    prepare(sql) {
      return {
        bind(...args) {
          const q = db.prepare(sql);
          return {
            async first() {
              return q.get(...args) || null;
            },
            async all() {
              return { results: q.all(...args) };
            },
            async run() {
              return { meta: { changes: Number(q.run(...args).changes) } };
            },
          };
        },
      };
    },
  });
  const svc = resaleService(store, { ready: {} }),
    j = await svc.get('alice');
  await svc.run('alice', {
    action: 'import',
    revision: 0,
    role: 'street',
    title: 'Synthetic',
    url: 'https://example.com/test',
    currency: 'USD',
    price: 100,
  });
  assert.equal(
    (await resaleService(store, { ready: {} }).get('alice')).resale.items
      .length,
    1,
  );
  assert.equal(await store.get('bob', j.id), null);
  assert.throws(
    () =>
      applyWorkCommand(
        j,
        {
          id: crypto.randomUUID(),
          action: 'complete',
          note: 'synthetic invalid completion',
        },
        0,
      ),
    /リセール/,
  );
});
void test('three scouts use saved searches, preserve partial failures and never buy', async () => {
  const calls = [],
    r = repo(),
    p = {
      ready: { search: true },
      async search(q, role) {
        calls.push([q, role]);
        if (role === 'archive') throw Error('offline');
        return [
          candidate({
            role,
            title: q,
            url: `https://example.com/${role}`,
            currency: 'USD',
            price: 100,
          }),
        ];
      },
      async purchase() {
        assert.fail('must not buy');
      },
    };
  const svc = resaleService(r, p);
  await svc.get('owner');
  await svc.run('owner', {
    action: 'searches',
    revision: 0,
    street: 'hoodie',
    archive: 'jacket',
    objects: 'lamp',
  });
  const j = await svc.run('owner', { action: 'scout', revision: 1 });
  assert.deepEqual(calls, [
    ['hoodie', 'street'],
    ['jacket', 'archive'],
    ['lamp', 'objects'],
  ]);
  assert.equal(j.resale.items.length, 2);
  assert.equal(j.resale.scan.results[1].count, 0);
  assert.ok(j.resale.scan.results[1].error);
  await svc.run('owner', { action: 'pause', revision: 2 });
  await assert.rejects(svc.run('owner', { action: 'scout', revision: 3 }));
});
void test('service owns one shared portfolio per owner and one concurrent dispatch wins', async () => {
  const r = repo();
  let calls = 0;
  const p = {
    ready: { purchase: true, publish: true, sandbox: true, liveEnabled: false },
    async purchase() {
      calls++;
      return 'P1';
    },
  };
  const svc = resaleService(r, p);
  let j = await svc.get('owner');
  const { s } = setup();
  await r.update('owner', { ...j, resale: s, revision: 1 }, 0);
  j = await svc.get('owner');
  const input = {
    action: 'purchase',
    revision: j.revision,
    itemId: s.items[0].id,
    operationId: crypto.randomUUID(),
    confirm: true,
    digest: await digest(s.items[0].checkout),
  };
  const results = await Promise.allSettled([
    svc.run('owner', input),
    svc.run('owner', { ...input, operationId: crypto.randomUUID() }),
  ]);
  assert.equal(calls, 1);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal((await svc.get('other')).resale.items.length, 0);
});
void test('proven pre-dispatch rejection releases reservation without recording a purchase', async () => {
  const r = repo(),
    p = {
      ready: { purchase: true, sandbox: true },
      async purchase() {
        throw new ResaleBeforeDispatchError('quote changed');
      },
    };
  const svc = resaleService(r, p),
    j = await svc.get('owner'),
    { s } = setup();
  await r.update('owner', { ...j, resale: s, revision: 1 }, 0);
  const result = await svc.run('owner', {
    action: 'purchase',
    revision: 1,
    itemId: s.items[0].id,
    operationId: crypto.randomUUID(),
    confirm: true,
    digest: await digest(s.items[0].checkout),
  });
  assert.equal(result.resale.items[0].status, 'candidate');
  assert.equal(result.resale.items[0].purchase, undefined);
  assert.equal(result.resale.items[0].checkout, undefined);
  assert.equal(totals(result.resale).reserved, 0);
  assert.equal(result.resale.operations[0].resolution, 'not_dispatched');
});
void test('crash/timeout remains durable and is not automatically dispatched again', async () => {
  const r = repo(),
    p = {
      ready: { purchase: true, sandbox: true },
      async purchase() {
        throw Error('timeout');
      },
    };
  const svc = resaleService(r, p),
    j = await svc.get('owner'),
    { s } = setup();
  await r.update('owner', { ...j, resale: s, revision: 1 }, 0);
  await svc.run('owner', {
    action: 'purchase',
    revision: 1,
    itemId: s.items[0].id,
    operationId: crypto.randomUUID(),
    confirm: true,
    digest: await digest(s.items[0].checkout),
  });
  const restarted = resaleService(r, p),
    saved = await restarted.get('owner');
  assert.equal(saved.resale.items[0].status, 'purchase_unknown');
  assert.equal(totals(saved.resale).reserved, 11000);
  await assert.rejects(
    restarted.run('owner', {
      action: 'purchase',
      revision: saved.revision,
      itemId: s.items[0].id,
      operationId: crypto.randomUUID(),
      confirm: true,
      digest: await digest(s.items[0].checkout),
    }),
  );
});
void test('eBay checkout binds item, quantity, total and shipping to confirmation before placing order', async () => {
  const { i } = setup();
  const raw = {
    checkoutSessionId: 'c',
    lineItems: [{ itemId: i.externalId, quantity: 1 }],
    pricingSummary: { total: { currency: 'USD', value: '110.00' } },
    shippingAddress: { country: 'US' },
  };
  const requests = [];
  const p = ebayResaleProvider(
    { RESALE_EBAY_BUYER_TOKEN: 'synthetic' },
    async (url, init) => {
      requests.push([url, init]);
      return Response.json(
        url.endsWith('place_order') ? { purchaseOrderId: 'p' } : raw,
      );
    },
  );
  i.checkout = await p.prepare(i);
  raw.shippingAddress.country = 'JP';
  await assert.rejects(p.purchase(i), /変わりました/);
  assert.equal(
    requests.some((x) => x[0].endsWith('place_order')),
    false,
  );
  raw.shippingAddress.country = 'US';
  assert.equal(await p.purchase(i), 'p');
  assert.ok(requests.at(-1)[0].startsWith('https://apix.sandbox.ebay.com/'));
});
void test('production mutations fail closed while readonly search may be configured', async () => {
  let called = false;
  const p = ebayResaleProvider(
    { RESALE_EBAY_ENV: 'production', RESALE_EBAY_BUYER_TOKEN: 'synthetic' },
    async () => {
      called = true;
      return Response.json({});
    },
  );
  await assert.rejects(p.prepare(setup().i), /本番/);
  assert.equal(called, false);
});
void test('publish records offer before making it public and validates receipts', async () => {
  const { s, i } = setup();
  i.status = 'received';
  localAction(s, {
    action: 'draft',
    itemId: i.id,
    price: 20000,
    categoryId: '1',
    conditionCode: 'USED_GOOD',
    images: ['https://images.example.com/real.jpg'],
  });
  const calls = [];
  const p = ebayResaleProvider(
    {
      RESALE_EBAY_SELLER_TOKEN: 'synthetic',
      RESALE_EBAY_LOCATION: 'L',
      RESALE_EBAY_FULFILLMENT_POLICY: 'F',
      RESALE_EBAY_PAYMENT_POLICY: 'P',
      RESALE_EBAY_RETURN_POLICY: 'R',
    },
    async (url) => {
      calls.push(url);
      return url.includes('inventory_item')
        ? new Response(null, { status: 204 })
        : Response.json(
            url.endsWith('/publish')
              ? { listingId: 'listing' }
              : { offerId: 'offer' },
          );
    },
  );
  const id = await p.publish(i, async (o) => {
    assert.equal(o, 'offer');
    assert.equal(calls.length, 2);
  });
  assert.equal(id, 'listing');
  assert.equal(calls.length, 3);
});

void test('paused manual search makes no provider request or state change, and resume restores search', async () => {
  const calls = [];
  const svc = resaleService(repo(), {
    ready: { search: true },
    async search(query, role, currency) {
      calls.push({ query, role, currency });
      return [candidate({ role, title: query, url: 'https://example.com/resale', currency, price: 100 })];
    },
  });
  const initial = await svc.get('owner');
  const paused = await svc.run('owner', { action: 'pause', revision: initial.revision });
  await assert.rejects(
    svc.run('owner', { action: 'search', revision: paused.revision, role: 'street', query: 'hoodie' }),
    (error) => error.status === 409 && /停止中/.test(error.message),
  );
  assert.equal(calls.length, 0);
  assert.deepEqual(await svc.get('owner'), paused);
  const resumed = await svc.run('owner', { action: 'resume', revision: paused.revision });
  const searched = await svc.run('owner', { action: 'search', revision: resumed.revision, role: 'street', query: 'hoodie' });
  assert.deepEqual(calls, [{ query: 'hoodie', role: 'street', currency: 'USD' }]);
  assert.equal(searched.resale.items.length, 1);
  assert.equal(searched.revision, resumed.revision + 1);
});

void test('unconfigured manual search does not call the provider', async () => {
  let calls = 0;
  const svc = resaleService(repo(), { ready: { search: false }, async search() { calls++; return []; } });
  const job = await svc.get('owner');
  await assert.rejects(
    svc.run('owner', { action: 'search', revision: job.revision, role: 'street', query: 'hoodie' }),
    (error) => error.status === 503,
  );
  assert.equal(calls, 0);
});

void test('actual resale form disables manual search while paused and enables it after resume', () => {
  const source = readFileSync(new URL('../components/noah-resale.tsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const jsx = (type, props) => ({ type, props });
  const nodes = (tree, result = []) => {
    if (Array.isArray(tree)) tree.forEach((child) => nodes(child, result));
    else if (tree && typeof tree === 'object') { result.push(tree); nodes(tree.props?.children, result); }
    return result;
  };
  for (const [paused, searchReady, disabled] of [[true, true, true], [false, true, false], [false, false, true]]) {
    const job = createResaleJob(crypto.randomUUID());
    job.resale.paused = paused;
    const values = [{ job, ownerScope: 'fixture', totals: totals(job.resale), ready: { sandbox: true, search: searchReady }, approvals: {} }, '', false, '', 'street'];
    let cursor = 0;
    const exports = {};
    const modules = {
      react: { useState: () => [values[cursor++], () => {}], useEffect() {} },
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/link': { default: 'a' },
      './noah-resale.module.css': { default: new Proxy({}, { get: (_, key) => String(key) }) },
    };
    runInNewContext(code, { exports, require(name) { assert.ok(name in modules, name); return modules[name]; } });
    const all = nodes(exports.default());
    const searchForm = all.find((node) => node.type === 'form' && nodes(node).some((child) => child.type === 'input' && child.props.name === 'query'));
    assert.ok(searchForm);
    assert.equal(nodes(searchForm).find((node) => node.type === 'fieldset').props.disabled, disabled);
    // Stopping exploration must not prevent the owner from using the resume control.
    const pauseButton = all.find((node) => node.type === 'button' && node.props.children === (paused ? '新規操作を再開' : '探索・新規の購入・出品を停止'));
    assert.equal(pauseButton.props.disabled, false);
  }
});
