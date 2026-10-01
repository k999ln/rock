import test from 'node:test';
import assert from 'node:assert/strict';
import osManifest from '../app/manifest.ts';
import { skyAppManifest } from '../lib/sky-app-manifest.ts';

void test('Sky installs with a separate identity and opens inside its marketplace scope', () => {
  const os = osManifest();
  const sky = skyAppManifest(os);
  assert.equal(sky.name, 'Sky');
  assert.notEqual(sky.id, os.id);
  assert.equal(sky.start_url, '/sky/marketplace');
  assert.ok(sky.start_url.startsWith(sky.scope));
  assert.ok('/sky/tools/mr-citations'.startsWith(sky.scope));
  assert.ok(!'/wallet'.startsWith(sky.scope));
  assert.deepEqual(sky.icons, os.icons);
  assert.equal(os.start_url, '/');
  assert.equal(os.name, 'RockstarOS');
});
