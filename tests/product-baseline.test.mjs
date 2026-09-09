import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, validateBaseline } from '../scripts/check-product-baseline.mjs';

const source = JSON.parse(readFileSync(resolve(root, 'data/product-baseline.json'), 'utf8'));
void test('product baseline rejects lost requirements, stale-as-live claims and mismatched source evidence', () => {
  assert.equal(validateBaseline(source).repository, 'k999ln/rock');
  const missing = structuredClone(source);
  missing.requirements.pop();
  assert.throws(() => validateBaseline(missing), /RQ01〜RQ11/);
  const live = structuredClone(source);
  live.auditInputs.isLiveStatus = true;
  assert.throws(() => validateBaseline(live), /snapshot/);
  const mismatch = structuredClone(source);
  mismatch.auditInputs.nativeHead = 'a'.repeat(40);
  assert.throws(() => validateBaseline(mismatch), /SHA/);
  const escaped = structuredClone(source);
  escaped.authority = '../external.md';
  assert.throws(() => validateBaseline(escaped), /repository外/);
  assert.throws(() => validateBaseline(source, (path) => path.endsWith('AGENTS.md') ? 'missing links' : readFileSync(path, 'utf8')), /AGENTS/);
});
