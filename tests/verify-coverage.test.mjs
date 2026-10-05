import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts;

// Directories that hold independently packaged code with their own tests.
// Generated release copies (public-release/) and pinned originals (vendor/) are excluded.
const packageRoots = ['sites', 'toolkits'];
const skippedDirectories = new Set(['node_modules', 'dist', 'work', '.astro']);

function verifyReachableCommands() {
  const seen = new Set();
  const commands = [];
  const visit = name => {
    if (seen.has(name) || !(name in scripts)) return;
    seen.add(name);
    const command = scripts[name];
    commands.push(command);
    for (const match of command.matchAll(/npm run (?:-s )?([\w:.-]+)/g)) visit(match[1]);
  };
  visit('verify');
  return commands;
}

function testFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return skippedDirectories.has(entry.name) ? [] : testFiles(path);
    return /\.test\.(?:mjs|js|ts)$/.test(entry.name) ? [path] : [];
  });
}

function owningPackage(file) {
  let directory = dirname(file);
  while (directory.startsWith(root) && directory !== root) {
    if (existsSync(join(directory, 'package.json'))) return directory;
    directory = dirname(directory);
  }
  return dirname(file);
}

void test('npm run verify reaches the test suite of every site and toolkit package', () => {
  const commands = verifyReachableCommands().join('\n');
  const packages = new Set(
    packageRoots.flatMap(name => testFiles(join(root, name))).map(owningPackage),
  );
  assert.ok(packages.size > 0, 'expected at least one package with tests under sites/ or toolkits/');
  const uncovered = [...packages]
    .map(directory => relative(root, directory).split(sep).join('/'))
    .filter(path => !commands.includes(path))
    .sort((left, right) => left.localeCompare(right));
  assert.deepEqual(uncovered, [], `packages with tests not run by npm run verify: ${uncovered.join(', ')}`);
});

void test('the avocadoMini site suite builds from locked source before testing', () => {
  assert.equal(scripts['test:avocado-mini-site'], 'npm --prefix sites/avocado-mini test');
  const site = JSON.parse(readFileSync(join(root, 'sites/avocado-mini/package.json'), 'utf8'));
  assert.equal(site.scripts.pretest, 'npm run build');
  assert.equal(site.scripts.test, 'node --test tests/*.test.mjs');
  assert.match(site.scripts.build, /build:client.*stage-worker/);
  const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.ok(ci.indexOf('npm ci --prefix sites/avocado-mini') >= 0);
  assert.ok(ci.indexOf('npm ci --prefix sites/avocado-mini') < ci.indexOf('npm run verify'));
  assert.match(scripts.verify, /npm run test:avocado-mini-site(?: |$)/);
});
