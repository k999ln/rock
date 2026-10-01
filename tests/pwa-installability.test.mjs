import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import manifest from '../app/manifest.ts';

const root = resolve(import.meta.dirname, '..');

function pngSize(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

void test('PWA identity uses RockstarOS while navigation stays on the compatibility root scope', () => {
  const value = manifest();
  assert.equal(value.name, 'RockstarOS');
  assert.equal(value.short_name, 'RockstarOS');
  assert.equal(value.id, '/');
  assert.equal(value.start_url, '/');
  assert.equal(value.scope, '/');
  assert.equal(value.display, 'standalone');
  assert.equal(value.lang, 'ja');
  assert.equal(value.dir, 'ltr');
  assert.equal(value.prefer_related_applications, false);
});

void test('PWA provides exact install icons and an opaque full-bleed maskable icon', () => {
  const icons = manifest().icons || [];
  for (const size of [192, 512]) {
    const icon = icons.find(({ sizes }) => sizes === `${size}x${size}`);
    assert.equal(icon?.type, 'image/png');
    assert.match(icon?.purpose || '', /(?:^|\s)any(?:\s|$)/);
    assert.deepEqual(pngSize(resolve(root, `public${icon.src}`)), [size, size]);
  }

  const maskable = icons.find(({ purpose }) =>
    purpose?.split(/\s+/).includes('maskable'),
  );
  assert.equal(maskable?.sizes, 'any');
  assert.equal(maskable?.type, 'image/svg+xml');
  const source = readFileSync(resolve(root, `public${maskable.src}`), 'utf8');
  assert.match(source, /width="1024" height="1024"/);
  assert.match(source, /<rect width="24" height="24" fill="#d6eead"\/>/);
  assert.doesNotMatch(source, /<rect[^>]+\brx=/);
});
