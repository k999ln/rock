import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { copyWorkerBuildFixture } from '../scripts/worker-build-fixture.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'worker-build-fixture-'));
  const source = join(root, 'source'); mkdirSync(join(source, 'server'), { recursive: true });
  writeFileSync(join(source, 'server/wrangler.json'), JSON.stringify({ main: 'index.js' }));
  writeFileSync(join(source, 'server/index.js'), 'import "./__vinext_action_owner_manifest.js"; export default {};');
  return { root, source, destination: join(root, 'snapshot') };
}
void test('Worker fixture rejects the missing generated owner manifest before runtime startup', () => {
  const f = fixture(); try {
    assert.throws(() => copyWorkerBuildFixture(f.source, f.destination), /missing __vinext_action_owner_manifest/);
    assert.equal(existsSync(f.destination), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
void test('Worker fixture retains every manifest byte and excludes AppleDouble files', () => {
  const f = fixture(); try {
    writeFileSync(join(f.source, 'server/__vinext_action_owner_manifest.js'), 'export default {};\n');
    writeFileSync(join(f.source, 'server/__not_metadata.js'), 'export {};');
    writeFileSync(join(f.source, 'server/._index.js'), 'metadata');
    copyWorkerBuildFixture(f.source, f.destination);
    assert.equal(readFileSync(join(f.destination, 'server/__vinext_action_owner_manifest.js'), 'utf8'), 'export default {};\n');
    assert.equal(existsSync(join(f.destination, 'server/._index.js')), false);
    assert.equal(existsSync(join(f.destination, 'server/__not_metadata.js')), true);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
void test('Worker fixture refuses an existing destination without removing its data', () => {
  const f = fixture(); try {
    mkdirSync(f.destination); writeFileSync(join(f.destination, 'keep'), 'original');
    assert.throws(() => copyWorkerBuildFixture(f.source, f.destination), /must be new/);
    assert.equal(readFileSync(join(f.destination, 'keep'), 'utf8'), 'original');
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
