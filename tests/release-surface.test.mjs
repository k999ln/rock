import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { releaseProgress } from '../lib/release-progress.ts';

const root = resolve(import.meta.dirname, '..');
const readiness = JSON.parse(readFileSync(resolve(root, 'data/release-readiness.json'), 'utf8'));

void test('public release counts come from the audited distribution matrix', () => {
  assert.equal(releaseProgress(readiness, 'web-pwa-owner-preview').text, '3/3');
  assert.equal(releaseProgress(readiness, 'qemu-developer-preview').text, '6/10');
  assert.equal(releaseProgress(readiness, 'android-physical-preview').text, '0/5');
  assert.equal(releaseProgress(readiness, 'personal-number-identity').text, '1/7');
});

void test('release progress refuses unknown targets and exposes exact blockers', () => {
  assert.throws(() => releaseProgress(readiness, 'missing'), /Unknown release target/);
  assert.deepEqual(releaseProgress(readiness, 'qemu-developer-preview').blockedIds, [
    'product-license',
    'production-signing',
    'post-signing-same-candidate-acceptance',
    'public-distribution-approval',
  ]);
});
