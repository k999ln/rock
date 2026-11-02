import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'rock-domain-stage-'));
  for (const path of ['scripts', 'services/sky-web', 'dist/server']) mkdirSync(join(root, path), { recursive: true });
  writeFileSync(join(root, 'scripts/stage-sky-domain-router.mjs'), readFileSync(new URL('../scripts/stage-sky-domain-router.mjs', import.meta.url)));
  writeFileSync(join(root, 'dist/server/wrangler.json'), JSON.stringify({ main: 'index.js', compatibility_date: '2026-10-22', assets: { directory: '../client', html_handling: 'none' } }));
  writeFileSync(join(root, 'services/sky-web/domain-router.mjs'), 'export const marker = "first";\n');
  const run = () => spawnSync(process.execPath, ['scripts/stage-sky-domain-router.mjs'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  return { root, run, read: path => readFileSync(join(root, path), 'utf8'), write: (path, text) => writeFileSync(join(root, path), text), close: () => rmSync(root, { recursive: true, force: true }) };
}

void test('domain staging refreshes changed routing policy without replacing the built application', () => {
  const f = fixture();
  try {
    const application = 'export default { fetch: () => new Response("built application") };\n';
    f.write('dist/server/index.js', application);
    assert.equal(f.run().status, 0);
    assert.equal(f.read('dist/server/vinext.js'), application);
    assert.equal(f.read('dist/server/domain-router.mjs'), f.read('services/sky-web/domain-router.mjs'));
    const config = JSON.parse(f.read('dist/server/wrangler.json'));
    assert.deepEqual(config.assets, { directory: '../client', html_handling: 'none', binding: 'ASSETS', run_worker_first: true });
    assert.equal(config.compatibility_date, '2026-10-22');
    const wrapper = f.read('dist/server/index.js');
    config.assets.run_worker_first = false;
    f.write('dist/server/wrangler.json', JSON.stringify(config));
    f.write('services/sky-web/domain-router.mjs', 'export const marker = "updated policy";\n');
    assert.equal(f.run().status, 0);
    assert.equal(f.read('dist/server/vinext.js'), application);
    assert.equal(f.read('dist/server/index.js'), wrapper);
    assert.equal(JSON.parse(f.read('dist/server/wrangler.json')).assets.run_worker_first, true);
    assert.equal(f.read('dist/server/domain-router.mjs'), f.read('services/sky-web/domain-router.mjs'));
  } finally { f.close(); }
});

void test('domain staging refuses an unknown entrypoint without replacing its router or application', () => {
  const f = fixture();
  try {
    f.write('dist/server/index.js', 'export default "unknown entry";');
    f.write('dist/server/vinext.js', 'export default "retained app";');
    f.write('dist/server/domain-router.mjs', 'export default "retained router";');
    const configBefore = f.read('dist/server/wrangler.json');
    const result = f.run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /entrypoint is not staged/);
    assert.equal(f.read('dist/server/wrangler.json'), configBefore);
    assert.equal(f.read('dist/server/index.js'), 'export default "unknown entry";');
    assert.equal(f.read('dist/server/vinext.js'), 'export default "retained app";');
    assert.equal(f.read('dist/server/domain-router.mjs'), 'export default "retained router";');
  } finally { f.close(); }
});

void test('asset routing refuses a missing directory or conflicting binding before mutating build files', () => {
  for (const assets of [undefined, {}, { directory: '' }, { directory: '../client', binding: 'OTHER_ASSETS' }]) {
    const f = fixture();
    try {
      f.write('dist/server/index.js', 'export default "original app";');
      f.write('dist/server/wrangler.json', JSON.stringify({ main: 'index.js', assets }));
      const before = f.read('dist/server/wrangler.json');
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /asset directory|asset binding/);
      assert.equal(f.read('dist/server/wrangler.json'), before);
      assert.equal(f.read('dist/server/index.js'), 'export default "original app";');
      assert.throws(() => f.read('dist/server/vinext.js'), /ENOENT/);
    } finally { f.close(); }
  }
});
