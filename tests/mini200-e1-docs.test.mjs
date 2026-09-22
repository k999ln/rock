import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBaseline } from '../scripts/check-product-baseline.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(root, 'docs/avocado-mini-mini200-e1');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

void test('Mini200 E1 is a documented proposal, not runtime or physical acceptance', () => {
  const e1 = json('data/product-baseline.json').materialInvention.mini200E1;
  assert.equal(e1.requested, true);
  assert.equal(e1.usageHeightLimitMm, 200);
  assert.equal(e1.japaneseVoiceRequested, true);
  assert.equal(e1.runtimeIntegrated, false);
  assert.equal(e1.actualAsrTests, 0);
  assert.equal(e1.physicalTests, 0);
  assert.equal(e1.manufacturingReleased, false);
  assert.equal(e1.outerAppearanceConfirmed, false);
  assert.equal(e1.publishedSiteUpdated, false);
  assert.ok(existsSync(resolve(root, e1.design)));
});

void test('E1 preserves the four-view contract and Web capture boundary', () => {
  const legacy = json('contracts/avocado-mini-spatial-interaction.json');
  assert.equal(legacy['x-rockstaros-boundary'].fourDirectionalViewpointsRequired, true);
  assert.equal(legacy['x-rockstaros-boundary'].physicalExecutionAllowed, false);
  assert.match(read('public/_headers'), /camera=\(\)/);
  assert.match(read('public/_headers'), /microphone=\(\)/);
  assert.equal(json('data/product-baseline.json').materialInvention.spatialDevelopment.fourDirectionalSensorRig, true);
  assert.match(read('README.md'), /Mini200 E1/);
  assert.match(read('README.md'), /実音声認識・実機試験は0件/);
});

void test('game-first life design rejects satellite authority and unverified integration claims', () => {
  const baseline = json('data/product-baseline.json');
  const vision = baseline.gameFirstLifeVision;
  assert.ok(existsSync(resolve(root, vision.document)));
  assert.match(read('README.md'), /ゲームを入口に、生活全体をより豊かにする/);
  assert.equal(baseline.marketPositioning.leadHardwareForm, 'mini200_game_console_design');
  for (const [field, value] of [
    ['primaryExperience', 'satellite_only'],
    ['localGameLoopRequiresInternet', true],
    ['connectivityGrantsExecutionAuthority', true],
    ['lifeDeviceActionsRequireScopedConsent', false],
    ['automaticReplayOfExternalActionsOnReconnect', true],
    ['runtimeIntegrated', true],
    ['satelliteFieldTests', 1],
    ['lifeDeviceFieldTests', 1],
    ['existingPixelAndQemuGatesPreserved', false],
  ]) {
    const changed = structuredClone(baseline);
    changed.gameFirstLifeVision[field] = value;
    assert.throws(() => validateBaseline(changed), /ゲーム中心の生活OS設計/);
  }
});

void test('E1 authored SVGs and local Markdown destinations are present without machine paths', () => {
  const walk = (path) => readdirSync(path, { withFileTypes: true }).flatMap((item) => {
    const file = resolve(path, item.name);
    return item.isDirectory() ? walk(file) : [file];
  });
  const files = walk(base);
  const svgs = files.filter((file) => file.endsWith('.svg'));
  assert.equal(svgs.length, 7);
  for (const file of svgs) {
    const svg = readFileSync(file, 'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|file:\/\/|\/Users\//);
  }
  for (const file of files.filter((path) => path.endsWith('.md'))) {
    const body = readFileSync(file, 'utf8');
    assert.doesNotMatch(body, /\/Users\//);
    for (const match of body.matchAll(/\]\(([^)]+)\)/g)) {
      const target = match[1].split('#')[0];
      if (!target || /^(https?:|mailto:)/.test(target)) continue;
      const resolved = resolve(dirname(file), target);
      assert.ok(!relative(root, resolved).startsWith('..'), target);
      assert.ok(existsSync(resolved), `${relative(root, file)}: ${target}`);
    }
  }
});
