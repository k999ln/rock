import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The author chooses the sample and explicitly changes its source-relative
// import to the package entry. This is a synthetic offline workspace.
export async function createAuthorWorkspace(directory) {
  const archive = fileURLToPath(new URL('../../../public/toolkits/rockstaros-sky-tool-sdk-0.1.5.tgz', import.meta.url));
  const unpacked = join(directory, 'sdk-unpacked'), workspace = join(directory, 'author-workspace');
  await mkdir(unpacked);
  execFileSync('tar', ['-xzf', archive, '-C', unpacked], { timeout: 5000 });
  execFileSync(process.execPath, [join(unpacked, 'package/bin/create-sky-tool.mjs'), 'init', workspace,
    '--developer', 'fixture-author', '--app-id', 'com.example.fixture-author'], { timeout: 5000 });
  const generated = JSON.parse(await readFile(join(workspace, 'package.json'), 'utf8'));
  assert.equal(generated.dependencies['@rockstaros/sky-tool-sdk'], '^0.1.5');
  const scope = join(workspace, 'node_modules/@rockstaros'); await mkdir(scope, { recursive: true });
  await cp(join(unpacked, 'package'), join(scope, 'sky-tool-sdk'), { recursive: true });
  const resolved = execFileSync(process.execPath, ['--input-type=module', '-e',
    'console.log(import.meta.resolve("@rockstaros/sky-tool-sdk"))'], { cwd: workspace, encoding: 'utf8', timeout: 5000 }).trim();
  assert.equal(resolved, pathToFileURL(await realpath(join(scope, 'sky-tool-sdk/dist/index.mjs'))).href);
  const sample = await readFile(join(unpacked, 'package/examples/line-counter.mjs'), 'utf8');
  const authored = sample.replace("'../src/index.mjs'", "'@rockstaros/sky-tool-sdk'");
  assert.notEqual(authored, sample);
  await mkdir(join(workspace, 'examples'));
  await writeFile(join(workspace, 'examples/line-counter.mjs'), authored);
  await writeFile(join(workspace, 'index.mjs'), "export { createLineCounter, examplePermissions } from './examples/line-counter.mjs';\n");
  return import(pathToFileURL(join(workspace, 'index.mjs')).href);
}
