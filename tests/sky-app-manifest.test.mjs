import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import osManifest from '../app/manifest.ts';
import { campusSkyAppManifest, skyAppManifest } from '../lib/sky-app-manifest.ts';
import { CAMPUS_IDS, CAMPUSES } from '../lib/campus.ts';

void test('smis installs with a separate identity and opens inside its marketplace scope', () => {
  const os = osManifest();
  const sky = skyAppManifest(os);
  assert.equal(sky.name, 'Smith');
  assert.notEqual(sky.id, os.id);
  assert.equal(sky.start_url, '/sky/marketplace');
  assert.ok(sky.start_url.startsWith(sky.scope));
  assert.ok('/sky/tools/mr-citations'.startsWith(sky.scope));
  assert.ok(!'/wallet'.startsWith(sky.scope));
  assert.deepEqual(sky.icons, os.icons);
  assert.equal(os.start_url, '/');
  assert.equal(os.name, 'RockstarOS');
});

void test('each campus smis install keeps its own launch identity and name', () => {
  const os = osManifest();
  const sky = skyAppManifest(os);
  const identities = new Set();
  for (const id of CAMPUS_IDS) {
    const campus = campusSkyAppManifest(os, id);
    assert.equal(campus.id, `/sky/campus/${id}`);
    assert.equal(campus.name, `${CAMPUSES[id].shortName} Smith`);
    assert.equal(campus.start_url, `/sky/campus/${id}/hub`);
    assert.ok(campus.start_url.startsWith(campus.scope));
    assert.deepEqual(campus.icons, os.icons);
    assert.notEqual(campus.id, sky.id);
    identities.add(campus.id);
  }
  assert.equal(identities.size, CAMPUS_IDS.length);
});

void test('smis is the canonical display name while existing identifiers and product domains stay compatible', () => {
  const identity=JSON.parse(readFileSync(new URL('../data/product-identity.json',import.meta.url),'utf8'));
  assert.equal(identity.agentHub.displayName,'Smith');
  assert.equal(identity.agentHub.previousDisplayName,'smis');
  assert.equal(identity.agentHub.internalIdentifier,'sky');
  assert.equal(identity.agentHub.generalLaunchAllowed,false);
  const manifest=skyAppManifest(osManifest());
  assert.equal(manifest.name,identity.agentHub.displayName);
  assert.equal(manifest.short_name,identity.agentHub.displayName);
  assert.equal(manifest.id,'/sky');
  assert.equal(manifest.scope,'/sky/');
});

void test('renamed screens keep the exact launcher filenames in existing downloads', () => {
  for (const [path, filename] of [
    ['components/device-connection.tsx','Sky MCP接続.command'],
    ['components/sky-mcp-center.tsx','Sky MCP接続.command'],
    ['components/fashion-brand-ops-runner.tsx','RockstarOS Sky接続.command'],
  ]) {
    const source=readFileSync(new URL('../'+path,import.meta.url),'utf8').replace(/\s+/g,' ');
    assert.ok(source.includes(filename),`${path}: existing launcher must remain findable`);
  }
});
