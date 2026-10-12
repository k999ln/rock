import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { productionWrangler, startupFailureMetadata } from '../scripts/spider-web-runtime.mjs';

void test('production server uses the builder dependency even when the root runtime is older', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'spider-web-runtime-')));
  const packageAt = (path, manifest, files = ['index.js']) => {
    mkdirSync(path, { recursive: true });
    writeFileSync(join(path, 'package.json'), JSON.stringify(manifest));
    for (const file of files) writeFileSync(join(path, file), '');
  };
  try {
    packageAt(root, { name: 'fixture' });
    const plugin = join(root, 'node_modules/@cloudflare/vite-plugin');
    packageAt(plugin, { name: '@cloudflare/vite-plugin', exports: { '.': { import: './index.mjs' } } }, ['index.mjs']);
    const builderEntry = pathToFileURL(join(plugin, 'index.mjs')).href;
    packageAt(join(root, 'node_modules/wrangler'), {
      name: 'wrangler', version: '4.122.0', bin: { wrangler: 'index.js' },
    });
    const nested = join(plugin, 'node_modules/wrangler');
    packageAt(nested, { name: 'wrangler', version: '4.147.0', bin: { wrangler: 'index.js' } });
    assert.deepEqual(productionWrangler(builderEntry), { cli: join(nested, 'index.js'), version: '4.147.0' });
    // Exercise the real ESM resolver: the plugin has no CommonJS export.
    const helper = join(root, 'runtime.mjs');
    copyFileSync(new URL('../scripts/spider-web-runtime.mjs', import.meta.url), helper);
    const result = spawnSync(process.execPath, [helper, 'cli'], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), join(nested, 'index.js'));
    writeFileSync(join(nested, 'package.json'), JSON.stringify({
      name: 'wrangler', version: '4.147.0', bin: { wrangler: '../index.js' },
    }));
    assert.throws(() => productionWrangler(builderEntry), /Invalid production Wrangler executable/);
    rmSync(nested, { recursive: true });
    const deduped = spawnSync(process.execPath, [helper, 'cli'], { encoding: 'utf8', timeout: 5000 });
    assert.equal(deduped.status, 0, deduped.stderr);
    assert.equal(deduped.stdout.trim(), join(root, 'node_modules/wrangler/index.js'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

void test('startup diagnostics disclose only fixed classifications, never raw server values', () => {
  const marker = 'private-fixture-value-do-not-publish';
  const metadata = startupFailureMetadata(`ERR_RUNTIME_FAILURE: runtime failed to start; compatibility date is too far in the future\nTypeError: ${marker}\nURL=https://example.invalid/${marker}`);
  assert.deepEqual(metadata, {
    codes: ['ERR_RUNTIME_FAILURE'],
    signals: ['compatibilityDate', 'unsupportedFutureDate', 'runtimeStartup', 'typeError'],
  });
  assert.equal(JSON.stringify(metadata).includes(marker), false);
  assert.deepEqual(startupFailureMetadata(marker), { codes: [], signals: [] });
});
