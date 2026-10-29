import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

void test('SDK gzip uses canonical stored blocks independent of gzip compressor defaults', () => {
  const bytes = readFileSync(new URL('../public/toolkits/rockstaros-sky-tool-sdk-0.1.5.tgz', import.meta.url));
  assert.deepEqual(bytes.subarray(0, 10), Buffer.from('1f8b08000000000000ff', 'hex'));
  const blocks = []; let offset = 10, final = false;
  while (!final) {
    const header = bytes[offset++];
    assert.ok(header === 0 || header === 1, 'stored block with zero padding only');
    final = header === 1;
    const length = bytes.readUInt16LE(offset), complement = bytes.readUInt16LE(offset + 2);
    offset += 4;
    assert.equal(length ^ complement, 0xffff);
    if (!final) assert.equal(length, 65535);
    blocks.push(bytes.subarray(offset, offset + length)); offset += length;
  }
  assert.ok(blocks.length > 1, 'exercise multi-block encoding');
  assert.equal(offset + 8, bytes.length, 'exactly one gzip trailer');
  assert.deepEqual(Buffer.concat(blocks), gunzipSync(bytes));
  const corrupt = Buffer.from(bytes); corrupt[15] ^= 1;
  assert.throws(() => gunzipSync(corrupt), /incorrect data check/);
  const badLength = Buffer.from(bytes); badLength[13] ^= 1;
  assert.throws(() => gunzipSync(badLength), /invalid stored block lengths/);
  const archive = fileURLToPath(new URL('../public/toolkits/rockstaros-sky-tool-sdk-0.1.5.tgz', import.meta.url));
  const python = execFileSync('python3', ['-c', 'import gzip,sys;sys.stdout.buffer.write(gzip.open(sys.argv[1],"rb").read())', archive]);
  assert.deepEqual(python, gunzipSync(bytes));
});
