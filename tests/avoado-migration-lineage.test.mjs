import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex');

void test('already published avoado migration bytes cannot be replaced by the divergent GitHub lineage', () => {
  const proof = read('data/avoado-published-migration-lineage.json');
  assert.equal(proof.source, 'c4ab58b29d702abb03790fdca0a8ff708563bbd7');
  assert.equal(proof.version, 141);
  const sql = Object.keys(proof.sha256).filter(path => path.endsWith('.sql'));
  assert.equal(sql.length, 26);
  for (const [path, expected] of Object.entries(proof.sha256)) assert.equal(hash(path), expected, path);
});

void test('old main migration history remains recoverable but separate from the live migration source', () => {
  const base = 'drizzle-legacy/github-main-before-avoado-alignment';
  const proof = read(`${base}/provenance.json`);
  assert.equal(proof.source, '7bbb4b27ab6ca3b1d42bef4643c9dda8cb8ba0c6');
  assert.ok(proof.sha256['drizzle-main/0026_home_eve_linux_runtime.sql']);
  for (const [path, expected] of Object.entries(proof.sha256)) assert.equal(hash(`${base}/${path}`), expected, path);
  const staging = readFileSync(resolve(root, 'scripts/sites-migration-lineage.mjs'), 'utf8');
  assert.doesNotMatch(staging, /drizzle-legacy/);
});
