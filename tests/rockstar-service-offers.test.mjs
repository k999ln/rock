import assert from 'node:assert/strict';
import test from 'node:test';
import { createSkyToolPackageDraft, skyToolPackageKey, skyToolPackageSha256 } from '../lib/sky-tool-package.ts';
import { describeRockstarServiceOfferProfile, parseRockstarServiceOfferProfiles } from '../lib/rockstar-service-offers.ts';

const healthPackage = createSkyToolPackageDraft({
  sourceKind: 'github', sourceUrl: 'https://github.com/example/health-guide',
  developerName: 'Example Health', developerId: 'example-health', license: 'MIT',
  name: 'Health Guide', summary: 'A reviewed health information assistant.', version: '1.0.0',
});
const devPackage = createSkyToolPackageDraft({
  sourceKind: 'github', sourceUrl: 'https://github.com/example/dev-helper',
  developerName: 'Example Dev', developerId: 'example-dev', license: 'MIT',
  name: 'Dev Helper', summary: 'A reviewed developer assistant.', version: '2.0.0',
});
const healthKey = skyToolPackageKey(healthPackage);
const healthHash = await skyToolPackageSha256(healthPackage);
const devKey = skyToolPackageKey(devPackage);
const devHash = await skyToolPackageSha256(devPackage);
const raw = JSON.stringify({ schema: 'rockstar-service-offer-profiles/1', profiles: [
  { issuerId: 'retailer-a', offerId: 'lifeline-v1', profileId: 'lifeline', version: '1.0.0', label: 'Lifeline', packages: [{ packageKey: healthKey, manifestSha256: healthHash }] },
  { issuerId: 'retailer-a', offerId: 'developer-v1', profileId: 'developer', version: '2.0.0', label: 'Developer', packages: [{ packageKey: devKey, manifestSha256: devHash }] },
] });

await test('one channel-neutral offer maps to its own versioned initial agent pack', () => {
  const catalog = parseRockstarServiceOfferProfiles(raw);
  assert.deepEqual(catalog.profiles.map((item) => [item.offerId, item.profileId, item.version]), [
    ['lifeline-v1', 'lifeline', '1.0.0'], ['developer-v1', 'developer', '2.0.0'],
  ]);
  assert.throws(() => parseRockstarServiceOfferProfiles(JSON.stringify({
    schema: 'rockstar-service-offer-profiles/1', profiles: [catalog.profiles[0], catalog.profiles[0]],
  })), /ROCKSTAR_SERVICE_OFFER_PROFILE_INVALID/);
  assert.throws(() => parseRockstarServiceOfferProfiles(`${raw}${' '.repeat(16_384)}`), /ROCKSTAR_SERVICE_OFFER_PROFILE_INVALID/);
});

await test('only exact verified package manifest hashes appear as ready, with owner confirmation still required', async () => {
  const registry = [
    { packageKey: healthKey, manifest: healthPackage, manifestSha256: healthHash, status: 'verified', installable: true },
    { packageKey: devKey, manifest: devPackage, manifestSha256: devHash, status: 'verified', installable: true },
  ];
  const resolved = await describeRockstarServiceOfferProfile('retailer-a', 'lifeline-v1', raw, registry);
  assert.equal(resolved.state, 'ready');
  assert.equal(resolved.profileId, 'lifeline');
  assert.equal(resolved.version, '1.0.0');
  assert.equal(resolved.packages[0].name, 'Health Guide');
  assert.equal(resolved.activation, 'owner_choice_required');
  assert.equal((await describeRockstarServiceOfferProfile('retailer-b', 'lifeline-v1', raw, registry)).state, 'not_configured');
  assert.equal((await describeRockstarServiceOfferProfile('retailer-a', 'lifeline-v2', raw, registry)).state, 'not_configured');
});

await test('stale/revoked package pins and malformed profile configuration fail closed without removing base entitlement', async () => {
  const unavailable = await describeRockstarServiceOfferProfile('retailer-a', 'lifeline-v1', raw, [
    { packageKey: healthKey, manifest: healthPackage, manifestSha256: 'f'.repeat(64), status: 'verified', installable: true },
  ]);
  assert.equal(unavailable.state, 'review_required');
  assert.equal(unavailable.packages[0].state, 'unavailable');
  assert.equal((await describeRockstarServiceOfferProfile('retailer-a', 'lifeline-v1', '{broken')).state, 'catalog_unavailable');
  assert.equal((await describeRockstarServiceOfferProfile('retailer-a', 'lifeline-v1', undefined)).state, 'not_configured');
});
