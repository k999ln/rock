import test from 'node:test';
import assert from 'node:assert/strict';
import { createEsimPricingSnapshot, EsimPlanCatalogError, parseEsimServerPlanCatalog, selectEligibleEsimPlan, selectEsimOrderPricing, verifyEsimPricingSnapshot, verifyEsimStarterAgentPack } from '../lib/esim-plan-catalog.ts';

const plan = {
  packageKey: 'esim-lifeline',
  manifestSha256: 'a'.repeat(64),
  providerBundleName: 'lifeline_jp_1gb',
  providerCurrency: 'USD',
  maximumWholesaleMinor: 850,
  retailCurrency: 'jpy',
  retailAmountMinor: 1500,
  providerMinorToRetailNumerator: 1,
  providerMinorToRetailDenominator: 1,
  providerFeeReserveRetailMinor: 50,
  minimumGrossMarginRetailMinor: 600,
  starterAgentPack: {
    id: 'lifeline', version: '1.0.0',
    packages: [{ packageKey: 'dev.rockstar.offline-guide@1.0.0', manifestSha256: 'b'.repeat(64) }],
  },
};
const catalogRaw = JSON.stringify({ version: 'retail-2026-09-a', plans: [plan] });
const paidOrder = {
  id: '11111111-1111-4111-8111-111111111111',
  buyerUserId: 'alice',
  mode: 'live',
  packageKey: plan.packageKey,
  manifestSha256: plan.manifestSha256,
  amountMinor: plan.retailAmountMinor,
  currency: plan.retailCurrency,
  status: 'paid',
  refundedMinor: 0,
};

void test('server plan catalog fixes provider bundle, retail price and wholesale cap outside client input', () => {
  const catalog = parseEsimServerPlanCatalog(catalogRaw);
  assert.equal(catalog.version, 'retail-2026-09-a');
  assert.deepEqual(selectEligibleEsimPlan(catalog, paidOrder, 'alice'), plan);
  assert.throws(() => parseEsimServerPlanCatalog(undefined), (error) =>
    error instanceof EsimPlanCatalogError && error.code === 'CATALOG_NOT_CONFIGURED');
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({ version: 'v1', plans: [{ ...plan, providerDebitEnabled: true }] })), /CATALOG_INVALID/);
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({ version: 'v1', plans: [{ ...plan, starterAgentPack: { ...plan.starterAgentPack, packages: [] } }] })), /CATALOG_INVALID/);
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({ version: 'v1', plans: [{ ...plan, starterAgentPack: { ...plan.starterAgentPack, packages: [{ packageKey: 'not-a-key', manifestSha256: 'b'.repeat(64) }] } }] })), /CATALOG_INVALID/);
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({ version: 'v1', plans: [plan, plan] })), /CATALOG_INVALID/);
});

void test('separate eSIM plan types can pin distinct Lifeline and Developer starter packs', () => {
  const developer = {
    ...plan,
    packageKey: 'esim-developer',
    manifestSha256: 'c'.repeat(64),
    providerBundleName: 'developer_jp_3gb',
    retailAmountMinor: 1800,
    minimumGrossMarginRetailMinor: 900,
    starterAgentPack: {
      id: 'developer', version: '2.0.0', packages: [
        { packageKey: 'dev.rockstar.code-helper@1.2.0', manifestSha256: 'd'.repeat(64) },
        { packageKey: 'dev.rockstar.test-runner@1.1.0', manifestSha256: 'e'.repeat(64) },
      ],
    },
  };
  const catalog = parseEsimServerPlanCatalog(JSON.stringify({ version: 'multiple-packs-v1', plans: [plan, developer] }));
  assert.deepEqual(catalog.plans.map(({ starterAgentPack }) => starterAgentPack.id), ['lifeline', 'developer']);
  assert.equal(catalog.plans[0].starterAgentPack.packages.length, 1);
  assert.equal(catalog.plans[1].starterAgentPack.packages.length, 2);
});

void test('pricing snapshot is canonical, hash-bound and rejects a catalog version or margin mismatch', async () => {
  const catalog = parseEsimServerPlanCatalog(catalogRaw);
  const planSnapshot = await createEsimPricingSnapshot(catalog, catalog.plans[0]);
  assert.deepEqual(await verifyEsimPricingSnapshot(planSnapshot.canonicalJson, planSnapshot.sha256), {
    catalogVersion: catalog.version,
    plan,
  });
  await assert.rejects(verifyEsimPricingSnapshot(planSnapshot.canonicalJson, 'f'.repeat(64)), /CATALOG_INVALID/);
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({
    version: 'retail-unprofitable',
    plans: [{ ...plan, maximumWholesaleMinor: 1000 }],
  })), /CATALOG_INVALID/);
  assert.throws(() => parseEsimServerPlanCatalog(JSON.stringify({
    version: 'invalid-fx', plans: [{ ...plan, providerMinorToRetailDenominator: 0 }],
  })), /CATALOG_INVALID/);
});

void test('only the exact paid, unrefunded owner order and reviewed manifest version selects a plan', () => {
  const catalog = parseEsimServerPlanCatalog(catalogRaw);
  for (const [order, owner] of [
    [{ ...paidOrder, buyerUserId: 'mallory' }, 'alice'],
    [{ ...paidOrder, status: 'pending' }, 'alice'],
    [{ ...paidOrder, refundedMinor: 1 }, 'alice'],
    [{ ...paidOrder, mode: 'test' }, 'alice'],
    [{ ...paidOrder, amountMinor: 1499 }, 'alice'],
    [{ ...paidOrder, manifestSha256: 'b'.repeat(64) }, 'alice'],
  ]) assert.throws(() => selectEligibleEsimPlan(catalog, order, owner), EsimPlanCatalogError);
  assert.throws(() => selectEligibleEsimPlan(catalog, paidOrder, 'bob'), /ORDER_NOT_ELIGIBLE/);
});

void test('existing paid order keeps its immutable price catalog after server catalog changes', async () => {
  const original = parseEsimServerPlanCatalog(catalogRaw);
  const snapshot = await createEsimPricingSnapshot(original, original.plans[0]);
  const revisedRaw = JSON.stringify({ version: 'retail-2026-10-b', plans: [{
    ...plan, providerBundleName: 'lifeline_jp_2gb', maximumWholesaleMinor: 800,
  }] });
  const db = {
    prepare(sql) {
      assert.match(sql, /FROM esim_provider_orders/);
      return { bind(...values) {
        assert.deepEqual(values, [paidOrder.id, 'alice']);
        return { async first() { return { canonicalJson: snapshot.canonicalJson, sha256: snapshot.sha256 }; } };
      } };
    },
  };
  const result = await selectEsimOrderPricing(db, revisedRaw, paidOrder, 'alice');
  assert.equal(result.canonicalJson, snapshot.canonicalJson);
  assert.equal(result.sha256, snapshot.sha256);
  assert.deepEqual(result.plan, plan);
  assert.deepEqual(result.plan.starterAgentPack, plan.starterAgentPack);
  assert.deepEqual(await selectEsimOrderPricing(db, undefined, paidOrder, 'alice'), result);
  const notYetIssuedDb = { prepare() { return { bind() { return { async first() { return null; } }; } }; } };
  assert.equal((await selectEsimOrderPricing(notYetIssuedDb, revisedRaw, paidOrder, 'alice')).plan.providerBundleName,
    'lifeline_jp_2gb');
});

void test('initial agent pack only accepts the exact currently reviewed Sky package manifest', async () => {
  const { createSkyToolPackageDraft, skyToolPackageKey, skyToolPackageSha256 } = await import('../lib/sky-tool-package.ts');
  const manifest = createSkyToolPackageDraft({
    sourceKind: 'github', sourceUrl: 'https://github.com/rockstaros/offline-guide',
    developerId: 'rockstar', developerName: 'RockstarOS',
    license: 'MIT', name: 'Offline Guide', summary: 'Offline reference lookup.',
  });
  const packageKey = skyToolPackageKey(manifest);
  const manifestSha256 = await skyToolPackageSha256(manifest);
  const configuredPlan = {
    ...plan,
    starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{ packageKey, manifestSha256 }] },
  };
  const catalog = parseEsimServerPlanCatalog(JSON.stringify({ version: 'pack-test', plans: [configuredPlan] }));
  const reviewed = [{ packageKey, manifest, manifestSha256, status: 'verified', installable: true }];
  await verifyEsimStarterAgentPack(catalog.plans[0], reviewed);
  for (const invalid of [
    [{ ...reviewed[0], installable: false }],
    [{ ...reviewed[0], status: 'submitted' }],
    [{ ...reviewed[0], manifestSha256: 'c'.repeat(64) }],
    [{ ...reviewed[0], manifest: { ...manifest, version: '9.9.9' } }],
    [],
  ]) await assert.rejects(verifyEsimStarterAgentPack(catalog.plans[0], invalid), (error) =>
    error instanceof EsimPlanCatalogError && error.code === 'STARTER_PACK_UNAVAILABLE');
});
