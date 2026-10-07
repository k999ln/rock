import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharpModule = require.resolve(process.env.SHARP_SECURITY_TEST_MODULE || 'sharp');
const childProgram = `
  import { readFileSync } from 'node:fs';
  import { createRequire } from 'node:module';
  const require = createRequire(import.meta.url);
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const sharp = require(input.module);
  let result;
  if (input.operation === 'versions') {
    result = { sharp: sharp.versions.sharp, vips: sharp.versions.vips, rsvg: sharp.versions.rsvg };
  } else if (input.operation === 'svg') {
    const rendered = await sharp(Buffer.from(input.svg), { limitInputPixels: 16 })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    result = {
      width: rendered.info.width, height: rendered.info.height,
      channels: rendered.info.channels, pixels: [...rendered.data],
    };
  } else if (input.operation === 'png') {
    const encoded = await sharp(Buffer.from(input.pixels), {
      raw: { width: 2, height: 2, channels: 4 },
    }).png().toBuffer();
    const decoded = await sharp(encoded, { limitInputPixels: 16 })
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    result = {
      signature: [...encoded.subarray(0, 8)], encodedBytes: encoded.length,
      width: decoded.info.width, height: decoded.info.height,
      channels: decoded.info.channels, pixels: [...decoded.data],
    };
  } else {
    throw new Error('Unknown synthetic native probe');
  }
  process.stdout.write(JSON.stringify(result));
`;

// A stuck or crashing native decoder cannot hang the Node test runner.
// Fixtures are tiny in-memory data; there are no external files or URLs.
function probe(operation, fixture = {}) {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', childProgram], {
    input: JSON.stringify({ module: sharpModule, operation, ...fixture }),
    encoding: 'utf8',
    timeout: 10_000,
    killSignal: 'SIGKILL',
    maxBuffer: 64 * 1024,
  });
  assert.equal(result.error, undefined, 'bounded native probe must complete');
  assert.equal(result.signal, null, 'native probe must not crash or time out');
  assert.equal(result.status, 0, result.stderr || 'native probe must exit successfully');
  return JSON.parse(result.stdout);
}

function stableVersionParts(value) {
  assert.equal(typeof value, 'string', 'native library version must be reported');
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error('Expected a stable native library version');
  }
  return value.split('.').map(Number);
}

function atLeast(version, minimum) {
  const actual = stableVersionParts(version);
  const expected = stableVersionParts(minimum);
  for (let index = 0; index < 3; index++) {
    if (actual[index] !== expected[index]) return actual[index] > expected[index];
  }
  return true;
}

void test('loaded sharp and native SVG libraries meet the patched version floors', () => {
  const versions = probe('versions');
  for (const library of [
    { name: 'sharp', minimum: '0.35.5' },
    { name: 'vips', minimum: '8.18.7' },
    { name: 'rsvg', minimum: '2.63.2' },
  ]) {
    assert.equal(atLeast(versions[library.name], library.minimum), true,
      `${library.name} must meet native security floor ${library.minimum}`);
  }
});

void test('native SVG rasterization preserves exact pixels on a bounded fixture', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2">' +
    '<rect width="2" height="1" fill="#ff0000"/>' +
    '<rect y="1" width="2" height="1" fill="#0000ff"/></svg>';
  const rendered = probe('svg', { svg });
  assert.deepEqual(rendered, {
    width: 2, height: 2, channels: 4,
    pixels: [255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255],
  });
});

void test('native PNG encoding and decoding preserve RGBA compatibility', () => {
  const pixels = [17, 34, 51, 255, 200, 100, 50, 128, 0, 255, 127, 255, 100, 150, 200, 64];
  const rendered = probe('png', { pixels });
  assert.deepEqual(rendered.signature, [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(rendered.encodedBytes > 8 && rendered.encodedBytes < 4096);
  assert.equal(rendered.width, 2);
  assert.equal(rendered.height, 2);
  assert.equal(rendered.channels, 4);
  assert.deepEqual(rendered.pixels, pixels);
});
