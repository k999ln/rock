import test from 'node:test';
import assert from 'node:assert/strict';
import { createEsimPublicCatalog, readEsimPublicCatalog } from '../lib/esim-public-catalog.ts';
import { parseEsimServerPlanCatalog } from '../lib/esim-plan-catalog.ts';
import { createSkyToolPackageDraft, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';

const starterPackage = createSkyToolPackageDraft({
  sourceKind: 'github', sourceUrl: 'https://github.com/example/offline-guide',
  developerName: 'Example Inc.', developerId: 'example-inc', license: 'MIT',
  name: 'Offline Guide', summary: 'A reviewed offline help agent.', version: '1.0.0',
});
const starterPackageKey = skyToolPackageKey(starterPackage);
const starterPackageHash = await skyToolPackageSha256(starterPackage);

const serverPlan = {
  packageKey: 'internal-key', manifestSha256: 'a'.repeat(64), providerBundleName: 'provider_bundle',
  providerCurrency: 'USD', maximumWholesaleMinor: 850, retailCurrency: 'jpy', retailAmountMinor: 1500,
  providerMinorToRetailNumerator: 1, providerMinorToRetailDenominator: 1,
  providerFeeReserveRetailMinor: 50, minimumGrossMarginRetailMinor: 600,
  starterAgentPack: { id: 'lifeline', version: '1.0.0', packages: [{
    packageKey: starterPackageKey, manifestSha256: starterPackageHash,
  }] },
};
const serverCatalog = parseEsimServerPlanCatalog(JSON.stringify({ version: 'pricing-v1', plans: [serverPlan] }));
const customerTerms = {
  packageKey: serverPlan.packageKey,
  manifestSha256: serverPlan.manifestSha256,
  id: 'jp-travel-basic',
  name: '日本向けデータプラン',
  description: '日本国内で使うデータ通信プラン。',
  coverageCountryCodes: ['JP'],
  roamingCountryCodes: [],
  dataAllowance: { kind: 'fixed', amountMb: 1024 },
  validityDays: 7,
  serviceStarts: 'after_first_network_attach',
  installPrerequisites: ['対応するeSIM端末とWi-Fi接続が必要です。'],
};

void test('public eSIM catalog projects the reviewed initial pack without exposing provider pricing', async () => {
  const registry = [{ packageKey: starterPackageKey, manifest: starterPackage,
    manifestSha256: starterPackageHash, status: 'verified', installable: true }];
  const result = await createEsimPublicCatalog(
    JSON.stringify({ version: 'public-v1', plans: [customerTerms] }), serverCatalog, registry,
  );
  assert.deepEqual(result, {
    catalogVersion: 'public-v1',
    purchaseEnabled: false,
    commerceState: 'contract_pending',
    plans: [{
      id: customerTerms.id,
      name: customerTerms.name,
      description: customerTerms.description,
      coverageCountryCodes: ['JP'],
      roamingCountryCodes: [],
      dataAllowance: { kind: 'fixed', amountMb: 1024 },
      validityDays: 7,
      serviceStarts: 'after_first_network_attach',
      installPrerequisites: customerTerms.installPrerequisites,
      starterAgentPack: {
        id: 'lifeline', version: '1.0.0',
        packages: [{
          packageKey: starterPackageKey,
          name: 'Offline Guide',
          summary: 'A reviewed offline help agent.',
          reviewState: 'active',
        }],
      },
    }],
  });
  const serialized = JSON.stringify(result);
  for (const secret of ['internal-key', 'provider_bundle', '850', '1500', 'USD', starterPackageHash])
    assert.equal(serialized.includes(secret), false);
});

void test('unconfigured public catalog stays empty and unknown plans are not presented', async () => {
  assert.equal(await createEsimPublicCatalog(undefined, serverCatalog), null);
  assert.deepEqual(await readEsimPublicCatalog(undefined, JSON.stringify({ version: 'public-v1', plans: [] })), {
    commerceState: 'catalog_not_configured', purchaseEnabled: false, plans: [],
  });
  const unknown = { ...customerTerms, packageKey: 'unknown-plan' };
  const result = await createEsimPublicCatalog(JSON.stringify({ version: 'public-v1', plans: [unknown] }), serverCatalog);
  assert.deepEqual(result?.plans, []);
  assert.equal(result?.purchaseEnabled, false);
});

void test('catalog endpoint projection fails closed when either operator-owned document is invalid', async () => {
  await assert.rejects(readEsimPublicCatalog('{', JSON.stringify({ version: 'public-v1', plans: [] })));
  await assert.rejects(readEsimPublicCatalog(JSON.stringify({ version: 'v1', plans: [serverPlan] }), '{'));
});

void test('public catalog rejects overbroad, duplicate, or malformed customer terms', async () => {
  for (const candidate of [
    { ...customerTerms, coverageCountryCodes: ['JPN'] },
    { ...customerTerms, dataAllowance: { kind: 'fixed', amountMb: 0 } },
    { ...customerTerms, serviceStarts: 'when purchased' },
    { ...customerTerms, internalMargin: 10 },
  ]) await assert.rejects(createEsimPublicCatalog(
    JSON.stringify({ version: 'public-v1', plans: [candidate] }), serverCatalog), /ESIM_PUBLIC_CATALOG_INVALID/);
  await assert.rejects(createEsimPublicCatalog(
    JSON.stringify({ version: 'public-v1', plans: [customerTerms, customerTerms] }), serverCatalog),
  /ESIM_PUBLIC_CATALOG_INVALID/);
});

void test('unreviewed, expired, or manifest-altered starter packages are never shown as active', async () => {
  const catalog = JSON.stringify({ version: 'public-v1', plans: [customerTerms] });
  for (const registry of [
    [],
    [{ packageKey: starterPackageKey, manifest: starterPackage,
      manifestSha256: starterPackageHash, status: 'submitted', installable: false }],
    [{ packageKey: starterPackageKey, manifest: starterPackage,
      manifestSha256: starterPackageHash, status: 'verified', installable: false }],
    [{ packageKey: starterPackageKey, manifest: { ...starterPackage, name: 'tampered' },
      manifestSha256: starterPackageHash, status: 'verified', installable: true }],
  ]) {
    const result = await createEsimPublicCatalog(catalog, serverCatalog, registry);
    assert.deepEqual(result?.plans[0].starterAgentPack.packages, [{
      packageKey: starterPackageKey, name: null, summary: null, reviewState: 'unavailable',
    }]);
  }
});
