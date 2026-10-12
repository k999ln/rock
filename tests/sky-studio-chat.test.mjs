import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const studio = readFileSync(new URL('../components/rock-studio.tsx', import.meta.url), 'utf8');
const sdkRoot = new URL('../toolkits/sky-tool-sdk/', import.meta.url);

void test('Rock Studio exposes copy-first SDK integration for an existing tool', () => {
  assert.match(studio, /このコードを、/);
  assert.match(studio, /createSkyToolApp/);
  assert.match(studio, /rockstaros-sky-tool-sdk-0\.1\.3\.tgz/);
  assert.match(studio, /\/api\/sky\/developer-tokens/);
  assert.match(studio, /開発者キー（公開時のみ）/);
  assert.doesNotMatch(studio, /type="file"/);
});

void test('Rock Studio does not upload source code from the browser', () => {
  assert.doesNotMatch(studio, /\/api\/sky\/tool-packages/);
  assert.doesNotMatch(studio, /analyzeSkyCodeIntake/);
  assert.match(studio, /ソースコードの送信なし/);
});

void test('the SDK archive linked by Studio contains exactly the current package sources', () => {
  const manifest = JSON.parse(readFileSync(new URL('package.json', sdkRoot), 'utf8'));
  assert.equal(manifest.version, '0.1.3');
  const filename = `rockstaros-sky-tool-sdk-${manifest.version}.tgz`;
  assert.ok(studio.includes(`/toolkits/${filename}`));
  const archive = fileURLToPath(new URL(`../public/toolkits/${filename}`, import.meta.url));
  const files = ['README.md', 'bin/create-sky-tool.mjs', 'examples/minimal.mjs', 'package.json', 'src/index.mjs'];
  const options = { timeout: 5000, maxBuffer: 128 * 1024 };
  const members = execFileSync('tar', ['-tzf', archive], options).toString('utf8').trim().split('\n');
  assert.deepEqual(members.sort(), files.map((name) => `package/${name}`).sort());
  for (const name of files) {
    const packaged = execFileSync('tar', ['-xOzf', archive, `package/${name}`], options);
    assert.ok(packaged.equals(readFileSync(new URL(name, sdkRoot))), `SDK archive must match ${name}`);
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
  assert.equal(generated.dependencies['@rockstaros/sky-tool-sdk'], '^0.1.3');
});
