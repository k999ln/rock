import test from 'node:test';
import assert from 'node:assert/strict';
import osManifest from '../app/manifest.ts';
import { campusSkyAppManifest, skyAppManifest } from '../lib/sky-app-manifest.ts';
import { CAMPUS_IDS, CAMPUSES } from '../lib/campus.ts';

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

void test('each campus Sky install keeps its own launch identity and name', () => {
  const os = osManifest();
  const sky = skyAppManifest(os);
  const identities = new Set();
  for (const id of CAMPUS_IDS) {
    const campus = campusSkyAppManifest(os, id);
    assert.equal(campus.id, `/sky/campus/${id}`);
    assert.equal(campus.name, `${CAMPUSES[id].shortName} Sky`);
    assert.equal(campus.start_url, `/sky/campus/${id}/hub`);
    assert.ok(campus.start_url.startsWith(campus.scope));
    assert.deepEqual(campus.icons, os.icons);
    assert.notEqual(campus.id, sky.id);
    identities.add(campus.id);
  }
  assert.equal(identities.size, CAMPUS_IDS.length);
});
