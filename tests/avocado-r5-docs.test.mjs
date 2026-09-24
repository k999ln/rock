import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, validateBaseline } from '../scripts/check-product-baseline.mjs';

const read = (path) => readFileSync(resolve(root, path), 'utf8');
const baseline = JSON.parse(read('data/product-baseline.json'));

void test('R5 rejects required hubs, oversize envelopes and unverified acceptance claims', () => {
  assert.doesNotThrow(() => validateBaseline(baseline));
  for (const [field, value] of [
    ['maximumUsageHeightMm', 201],
    ['heightIncludesBaseFeetCap', false],
    ['minimumNodeCount', 4],
    ['sameTypePeerExpansion', false],
    ['separateEdgeHubRequired', true],
    ['externalPcRequiredForCoreFunctions', true],
    ['externalPowerRequired', false],
    ['batteryAdopted', true],
    ['displayRequirement', 'wall_projection'],
    ['displayStatus', 'room_scale_validated'],
    ['physicalTests', 1],
    ['manufacturingReleased', true],
    ['runtimeIntegrated', true],
    ['publishedSiteUpdated', true],
    ['existingPixelQemuMaterialAndWalletEvidencePreserved', false],
  ]) {
    const changed = structuredClone(baseline);
    changed.marketPositioning.r5[field] = value;
    assert.throws(() => validateBaseline(changed), /R5の単体自律・200mm/, field);
  }
});

void test('R5 prices remain unconfirmed and earlier commercial figures stay historical', () => {
  const market = baseline.marketPositioning;
  assert.equal(market.legacyCommercialFields.appliesToCurrentR5, false);
  assert.equal(market.r5.priceStatus, 'not_confirmed_for_R5_do_not_inherit_E3_prices');
  assert.equal(market.tower20E3.role, 'historical_E3_baseline_superseded_by_R5');
  assert.equal(market.mini200E2Integration.role, 'historical_E2_central_core_architecture_not_current_R5_topology');
});

void test('the concise landing page links to complete progress and explicitly withholds manufacture', () => {
  const readme = read('README.md');
  assert.match(readme, /docs\/avocado-mini-r5\/README\.md/);
  assert.match(readme, /製造承認は保留/);
  assert.match(readme, /実機試験は0件/);
  assert.match(readme, /project\.md#全taskの作業進捗/);
  assert.doesNotMatch(readme, /<!-- project-status:start -->/);
  assert.match(read('project.md'), /## 全taskの作業進捗\s+<!-- project-status:start -->/);
});
