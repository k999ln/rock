import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { auditWebAssetClosure } from '../scripts/check-web-asset-closure.mjs';

void test('web asset closure accepts references included in the client archive', () => {
  const dist = mkdtempSync(join(tmpdir(), 'rock-assets-ok-'));
  mkdirSync(join(dist, 'client/_next/static/chunks'), { recursive: true });
  mkdirSync(join(dist, 'server'), { recursive: true });
  writeFileSync(join(dist, 'client/_next/static/chunks/app.js'), 'export {};');
  writeFileSync(
    join(dist, 'server/__vite_rsc_assets_manifest.js'),
    'export const assets=["/_next/static/chunks/app.js"]',
  );
  assert.deepEqual(auditWebAssetClosure(dist), { references: 1, missing: [] });
});

void test('web asset closure reports a referenced chunk omitted from the archive', () => {
  const dist = mkdtempSync(join(tmpdir(), 'rock-assets-missing-'));
  mkdirSync(join(dist, 'client'), { recursive: true });
  mkdirSync(join(dist, 'server'), { recursive: true });
  writeFileSync(
    join(dist, 'server/vinext-client-assets.js'),
    '{"file":"_next/static/css/missing.css"}',
  );
  assert.deepEqual(auditWebAssetClosure(dist), {
    references: 1,
    missing: [
      {
        asset: '_next/static/css/missing.css',
        sources: ['server/vinext-client-assets.js'],
      },
    ],
  });
});
