import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diagnoseGameIntake, gameIntakeSha256 } from '../lib/game-intake.ts';
import { GAME_SANDBOX_RULES, GAME_SANDBOX_SAVE_FORMAT, GAME_SANDBOX_SAVE_VERSION } from '../lib/game-sandbox.ts';

const bytes = s => new TextEncoder().encode(s);
// Two authors/two existing sample methods. Static byte fixtures only: no
// assertion that either engine was installed, executed, isolated or timed.
async function fixture(method = 'particle', author = 'author-a') {
  const file = method === 'particle'
    ? new Uint8Array(await readFile(new URL('./fixtures/game-sandbox-session.json', import.meta.url)))
    : new Uint8Array(await readFile(new URL('../sites/avocado-mini/creator-kit/game.js', import.meta.url)));
  const path = method === 'particle' ? 'session.json' : 'game.js';
  const assetDigest = await gameIntakeSha256(file);
  const packageBytes = bytes(JSON.stringify([{ bytes: file.length, path, sha256: assetDigest }]));
  const digest = await gameIntakeSha256(packageBytes);
  const manifest = {
    schema: 'rock.game-package/1', gameId: 'game-' + author, revision: 'r1', authorId: author,
    sourceKind: 'owned-web-bundle', packageFormat: 'file-set', packageSha256: digest,
    rights: { grantId: 'grant-' + author, licenseId: 'MIT', expiresAt: 2000 },
    engine: { id: method === 'particle' ? 'rock-particle-sandbox' : 'mini-browser-starter', version: '1' },
    runtime: { id: method === 'particle' ? 'rock-particle-host' : 'browser-esm', version: '1' },
    entry: path, assets: [{ id: 'main', path, sha256: assetDigest, bytes: file.length, licenseId: 'MIT' }],
    capabilities: ['render.2d', 'input.pointer', 'game.points.issue'],
    resources: { packageBytes: packageBytes.length, expandedBytes: file.length, fileCount: 1,
      memoryBytes: 1024, cpuMillis: 100, timeMillis: 1000, outputBytes: 1024 },
    save: { format: GAME_SANDBOX_SAVE_FORMAT, version: GAME_SANDBOX_SAVE_VERSION, ruleId: GAME_SANDBOX_RULES.id },
  };
  const context = {
    ownerId: 'owner-a', observedAt: 1000, packageBytes, files: [{ path, bytes: file }],
    grants: [{ id: manifest.rights.grantId, ownerId: 'owner-a', authorId: author, gameId: manifest.gameId,
      revision: 'r1', packageSha256: digest, licenseId: 'MIT', expiresAt: 2000, revoked: false }],
    target: { id: 'host-fixture', revision: '1', capabilities: [...manifest.capabilities],
      runtimes: [manifest.runtime], limits: { packageBytes: 65536, expandedBytes: 65536, fileCount: 128,
        memoryBytes: 2048, cpuMillis: 1000, timeMillis: 10000, outputBytes: 2048 } },
  };
  return { manifest, context };
}
const diagnose = f => diagnoseGameIntake(f.manifest, f.context);

void test('two existing sample methods and authors produce static candidates only, without input mutation', async () => {
  for (const [method, author] of [['particle', 'author-a'], ['browser', 'author-b']]) {
    const f = await fixture(method, author);
    const before = structuredClone(f);
    const d = await diagnose(f);
    assert.equal(d.status, 'launch_candidate');
    assert.match(d.adapterCandidate, /fixture\/1$/u);
    assert.equal(d.ownerId, 'owner-a'); assert.equal(d.observedAt, 1000);
    assert.deepEqual(Object.values(d.checks), Array(4).fill('unverified'));
    assert.deepEqual(Object.values(d.measurements), Array(4).fill(null));
    assert.deepEqual(f, before);
    assert.deepEqual(await diagnose(f), d);
    assert.notEqual(d.manifestSha256, d.packageSha256);
  }
});

void test('rights bind owner, author, game/revision, package digest, license, expiry and revocation', async () => {
  const cases = [
    f => { delete f.manifest.rights; },
    f => { f.manifest.rights = null; },
    f => { f.context.grants = []; },
    f => { f.context.grants.push({ ...f.context.grants[0] }); },
    f => { f.context.ownerId = 'owner-b'; },
    f => { f.manifest.authorId = 'forged-author'; },
    f => { f.manifest.gameId = 'another-game'; },
    f => { f.manifest.revision = 'r2'; },
    f => { f.context.grants[0].packageSha256 = '0'.repeat(64); },
    f => { f.manifest.assets[0].licenseId = 'unlicensed'; },
    f => { f.manifest.rights.licenseId = 'other-license'; },
    f => { f.context.observedAt = 2000; },
    f => { f.context.grants[0].revoked = true; },
  ];
  for (const change of cases) {
    const f = await fixture(); change(f);
    assert.equal((await diagnose(f)).status, 'rights_blocked');
  }
});

void test('unknown engines and unpinned versions never become candidates; missing target capability is distinct', async () => {
  for (const field of ['engine', 'runtime']) {
    const f = await fixture(); f.manifest[field].version = '999';
    assert.equal((await diagnose(f)).status, 'unsupported');
  }
  const unknown = await fixture(); unknown.manifest.engine.id = 'arbitrary-shell';
  assert.equal((await diagnose(unknown)).status, 'unsupported');
  const f = await fixture(); f.context.target.runtimes = [];
  assert.equal((await diagnose(f)).status, 'missing_capability');
  f.context.target.runtimes = [f.manifest.runtime]; f.context.target.capabilities = [];
  assert.equal((await diagnose(f)).status, 'missing_capability');
});

void test('point declaration grants no Wallet/shell/root/network capability; unknown fields fail closed', async () => {
  for (const capability of ['wallet.credit', 'wallet.reserve', 'shell', 'root', 'network', 'device.microphone']) {
    const f = await fixture(); f.manifest.capabilities.push(capability); f.context.target.capabilities.push(capability);
    assert.equal((await diagnose(f)).status, 'unsupported');
  }
  for (const field of ['wallet', 'command', 'signature', 'permissions']) {
    const f = await fixture(); f.manifest[field] = 'untrusted';
    assert.equal((await diagnose(f)).status, 'invalid_manifest');
  }
});

void test('resource limits reject declarations and actual bytes; archive intake is unsupported without unpacking', async () => {
  for (const key of Object.keys((await fixture()).manifest.resources)) {
    const f = await fixture(); f.manifest.resources[key] = f.context.target.limits[key] + 1;
    assert.equal((await diagnose(f)).status, 'missing_capability');
  }
  const actual = await fixture(); actual.context.packageBytes = new Uint8Array(65537);
  assert.equal((await diagnose(actual)).status, 'missing_capability');
  const zip = await fixture(); zip.manifest.packageFormat = 'zip';
  assert.equal((await diagnose(zip)).status, 'invalid_manifest');
  for (const value of [0, -1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const f = await fixture(); f.manifest.resources.fileCount = value;
    assert.equal((await diagnose(f)).status, 'invalid_manifest');
  }
});

void test('traversal, aliases, URL and shell-like entry paths are never normalized into runnable paths', async () => {
  for (const path of ['../main.js', '/main.js', 'a/../b', './main.js', 'a//b', 'C:/main.js', 'a\\b', '%2e%2e/main.js', 'https://x', 'a\u0000b', '$(id).js']) {
    const f = await fixture(); f.manifest.entry = path;
    assert.equal((await diagnose(f)).status, 'invalid_manifest', path);
    f.manifest.entry = 'session.json'; f.context.files[0].path = path;
    assert.equal((await diagnose(f)).status, 'invalid_manifest', path);
  }
});

void test('duplicate IDs, portable path collisions, capabilities and missing entry are rejected', async () => {
  for (const mutation of [
    f => { f.manifest.assets.push({ ...f.manifest.assets[0], path: 'second.json' }); },
    f => { f.manifest.assets.push({ ...f.manifest.assets[0], id: 'second', path: 'SESSION.JSON' }); },
    f => { f.manifest.capabilities.push(f.manifest.capabilities[0]); },
    f => { f.manifest.entry = 'missing.json'; },
    f => { f.context.files.push({ ...f.context.files[0], path: 'SESSION.JSON' }); f.manifest.resources.fileCount = 2; f.manifest.assets.push({ ...f.manifest.assets[0], id: 'second', path: 'other.json' }); },
  ]) {
    const f = await fixture(); mutation(f);
    assert.equal((await diagnose(f)).status, 'invalid_manifest');
  }
});

void test('changed package or asset bytes, sizes and hashes reject and preserve original input', async () => {
  for (const mutation of [
    f => { f.manifest.packageSha256 = 'f'.repeat(64); },
    f => { f.manifest.assets[0].sha256 = 'f'.repeat(64); },
    f => { f.manifest.assets[0].bytes += 1; },
    f => { f.context.files[0].bytes = bytes('tamper'); },
    f => { f.manifest.resources.expandedBytes += 1; },
    f => { f.manifest.resources.packageBytes += 1; },
  ]) {
    const f = await fixture(); mutation(f);
    const before = structuredClone(f);
    assert.equal((await diagnose(f)).status, 'invalid_manifest');
    assert.deepEqual(f, before);
  }
});

void test('self-consistent replacement assets cannot reuse the granted package digest', async () => {
  const f = await fixture(); const replacement = bytes('untrusted replacement');
  f.context.files[0].bytes = replacement;
  f.manifest.assets[0].bytes = replacement.length;
  f.manifest.assets[0].sha256 = await gameIntakeSha256(replacement);
  f.manifest.resources.expandedBytes = replacement.length;
  const d = await diagnose(f);
  assert.equal(d.status, 'invalid_manifest');
  assert.deepEqual(d.reasons, ['file_set_index_mismatch']);
});

void test('multi-file package index binds all assets independent of manifest asset ordering', async () => {
  const f = await fixture(); const content = bytes('second asset');
  const asset = { id: 'second', path: 'data/extra.json', sha256: await gameIntakeSha256(content), bytes: content.length, licenseId: 'MIT' };
  f.manifest.assets.push(asset); f.context.files.push({ path: asset.path, bytes: content });
  const entries = f.manifest.assets.map(a => ({ bytes: a.bytes, path: a.path, sha256: a.sha256 }))
    .sort((a, b) => a.path < b.path ? -1 : 1);
  f.context.packageBytes = bytes(JSON.stringify(entries));
  f.manifest.packageSha256 = await gameIntakeSha256(f.context.packageBytes);
  f.context.grants[0].packageSha256 = f.manifest.packageSha256;
  f.manifest.resources.packageBytes = f.context.packageBytes.length;
  f.manifest.resources.expandedBytes += content.length; f.manifest.resources.fileCount = 2;
  assert.equal((await diagnose(f)).status, 'launch_candidate');
  f.manifest.assets.reverse(); f.context.files.reverse();
  assert.equal((await diagnose(f)).status, 'launch_candidate');
  f.context.target.limits.expandedBytes = 1;
  assert.equal((await diagnose(f)).status, 'missing_capability');
});

void test('owner/save/revision/rule/format fences reject old metadata without migrating or replacing saves', async () => {
  const f = await fixture();
  f.context.save = { ownerId: f.context.ownerId, gameId: f.manifest.gameId, revision: 'r1', ...f.manifest.save };
  assert.equal((await diagnose(f)).status, 'launch_candidate');
  for (const [key, value] of [['ownerId', 'owner-b'], ['gameId', 'other'], ['revision', 'r0'], ['format', 'old'], ['version', 2], ['ruleId', 'old']]) {
    const changed = structuredClone(f); changed.context.save[key] = value;
    const before = structuredClone(changed.context.save);
    assert.equal((await diagnose(changed)).status, 'unsupported');
    assert.deepEqual(changed.context.save, before);
  }
  f.manifest.save.ruleId = 'unknown';
  assert.equal((await diagnose(f)).status, 'unsupported');
});

void test('manifest digest binds permissions/resources/entry/save and is independent of object key order', async () => {
  const f = await fixture(); const original = await diagnose(f);
  const reordered = Object.fromEntries(Object.entries(f.manifest).reverse());
  assert.equal((await diagnoseGameIntake(reordered, f.context)).manifestSha256, original.manifestSha256);
  f.manifest.capabilities = ['render.2d'];
  assert.notEqual((await diagnose(f)).manifestSha256, original.manifestSha256);
  assert.equal((await diagnoseGameIntake(null, f.context)).status, 'invalid_manifest');
});
