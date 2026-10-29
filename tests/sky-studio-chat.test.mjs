import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = readFileSync(new URL('../components/rock-studio.tsx', import.meta.url), 'utf8');
const sdkRoot = new URL('../toolkits/sky-tool-sdk/', import.meta.url);

void test('Rock Studio exposes copy-first SDK integration for an existing tool', () => {
  assert.match(studio, /このコードを、/);
  assert.match(studio, /createSkyToolApp/);
  assert.match(studio, /rockstaros-sky-tool-sdk-0\.1\.5\.tgz/);
  assert.match(studio, /\/api\/sky\/developer-tokens/);
  assert.match(studio, /開発者キー（公開時のみ）/);
  assert.doesNotMatch(studio, /type="file"/);
});

void test('Rock Studio does not upload source code from the browser', () => {
  assert.doesNotMatch(studio, /\/api\/sky\/tool-packages/);
  assert.doesNotMatch(studio, /analyzeSkyCodeIntake/);
  assert.match(studio, /ソースコードの送信なし/);
});

void test('the versioned SDK archive contains the built entry and exact package sources', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', sdkRoot), 'utf8'));
  assert.equal(manifest.version, '0.1.5'); assert.equal(manifest.exports, './dist/index.mjs');
  const archive = fileURLToPath(new URL(`../public/toolkits/rockstaros-sky-tool-sdk-${manifest.version}.tgz`, import.meta.url));
  const files = ['README.md', 'build.mjs', 'bin/create-sky-tool.mjs', 'examples/minimal.mjs', 'examples/line-counter.mjs', 'package.json', 'src/index.mjs', 'dist/index.mjs'];
  const options = { timeout: 5000, maxBuffer: 128 * 1024 };
  const members = execFileSync('tar', ['-tzf', archive], options).toString('utf8').trim().split('\n');
  assert.deepEqual(members.sort(), files.map((name) => `package/${name}`).sort());
  for (const name of files) {
    const packaged = execFileSync('tar', ['-xOzf', archive, `package/${name}`], options);
    const source = name === 'dist/index.mjs' ? 'src/index.mjs' : name;
    assert.ok(packaged.equals(readFileSync(new URL(source, sdkRoot))), `SDK archive must match ${source}`);
  }
  for (const [version, expected] of [
    ['0.1.3', '5ee84a4d158096b0965b08c71e1fbcf2cfcaa6b9046ce7e6994fb178bdce4c57'],
    ['0.1.4', 'aa82db15f5a5b480844efd5ddbc2d556dde18ea318d2c0254c34de0535e63cbe'],
  ]) {
    const old = readFileSync(new URL(`../public/toolkits/rockstaros-sky-tool-sdk-${version}.tgz`, import.meta.url));
    assert.equal(createHash('sha256').update(old).digest('hex'), expected);
  }
});

void test('the SDK starter requires the patched SDK release', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'sky-sdk-starter-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const target = join(directory, 'example-tool');
  execFileSync(process.execPath, [fileURLToPath(new URL('bin/create-sky-tool.mjs', sdkRoot)), 'init', target], {
    timeout: 5000,
    maxBuffer: 64 * 1024,
  });
  const generated = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  assert.equal(generated.dependencies['@rockstaros/sky-tool-sdk'], '^0.1.5');
});
