import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import vectors from '../contracts/sky-compute-grid-lexical-embedding-vectors.json' with { type: 'json' };
import {
  COMPUTE_SKUS,
  FIXTURE_EMBEDDING_SKU,
  LEXICAL_EMBEDDING_MODEL_SPEC,
  LEXICAL_EMBEDDING_RUNTIME_SPEC,
  LEXICAL_EMBEDDING_SKU,
  LEXICAL_EMBEDDING_TOKENIZER_SPEC,
  compareLotOutputs,
  decodeLotInput,
  encodeLotInput,
  expectedOutputBytes,
  invalidLotOutput,
  lexicalEmbedding,
  skuForArtifacts,
  wellFormedText,
} from '../lib/sky-compute-grid-skus.ts';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const lexical = COMPUTE_SKUS.get(LEXICAL_EMBEDDING_SKU);

// A second implementation written the long way (BigInt, explicit 32-bit masks,
// no typed arrays). It follows LEXICAL_EMBEDDING_RUNTIME_SPEC line by line and
// is what the Android port is expected to look like.
function slowLexicalEmbedding(items) {
  const mask = 0xffffffffn;
  const multiply = (left, right) => (left * right) & mask;
  const output = [];
  for (const item of items) {
    const bytes = [...Buffer.from(item, 'utf8')];
    const counts = Array.from({ length: 256 }, () => 0);
    for (const gram of [2, 3, 4]) {
      for (let start = 0; start + gram <= bytes.length; start += 1) {
        let hash = 0x811c9dc5n;
        for (const byte of [gram, ...bytes.slice(start, start + gram)])
          hash = multiply(hash ^ BigInt(byte), 0x01000193n);
        hash ^= hash >> 16n;
        hash = multiply(hash, 0x85ebca6bn);
        hash ^= hash >> 13n;
        hash = multiply(hash, 0xc2b2ae35n);
        hash ^= hash >> 16n;
        counts[Number(hash & 0xffn)] += ((hash >> 8n) & 1n) === 1n ? -1 : 1;
      }
    }
    const maximum = Math.max(...counts.map(Math.abs));
    for (const count of counts) {
      const magnitude = maximum === 0 ? 0 : Number((BigInt(Math.abs(count)) * 254n + BigInt(maximum)) / (2n * BigInt(maximum)));
      output.push((count < 0 ? -magnitude : magnitude) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

const cosine = (left, right) => {
  const a = new Int8Array(left.buffer, left.byteOffset, left.byteLength);
  const b = new Int8Array(right.buffer, right.byteOffset, right.byteLength);
  let dot = 0; let aa = 0; let bb = 0;
  for (let index = 0; index < a.length; index += 1) { dot += a[index] * b[index]; aa += a[index] ** 2; bb += b[index] ** 2; }
  return dot / Math.sqrt(aa * bb);
};

void test('the artifact digests of the lexical SKU are the digests of its written specification', () => {
  assert.equal(lexical.artifacts.runtimeArtifactSha256, sha256(LEXICAL_EMBEDDING_RUNTIME_SPEC));
  assert.equal(lexical.artifacts.modelSha256, sha256(LEXICAL_EMBEDDING_MODEL_SPEC));
  assert.equal(lexical.artifacts.tokenizerSha256, sha256(LEXICAL_EMBEDDING_TOKENIZER_SPEC));
  assert.deepEqual(vectors.artifacts, lexical.artifacts);
  assert.equal(skuForArtifacts(lexical.artifacts).skuId, LEXICAL_EMBEDDING_SKU);
  assert.equal(skuForArtifacts({ ...lexical.artifacts, modelSha256: 'e'.repeat(64) }), null);
  // The host-fixture SKU is listed but has no engine and is never dispatched.
  const fixture = COMPUTE_SKUS.get(FIXTURE_EMBEDDING_SKU);
  assert.deepEqual([fixture.status, fixture.reference], ['fixture_only', null]);
  assert.deepEqual([lexical.status, typeof lexical.reference], ['dispatchable', 'function']);
});

void test('the reference implementation reproduces every published vector', () => {
  assert.equal(vectors.vectors.length >= 6, true);
  for (const vector of vectors.vectors) {
    const input = encodeLotInput(vector.items);
    assert.equal(input.byteLength, vector.inputBytes, vector.name);
    assert.equal(sha256(input), vector.inputSha256, vector.name);
    const output = lexicalEmbedding(decodeLotInput(input));
    assert.equal(output.byteLength, vector.outputBytes, vector.name);
    assert.equal(output.byteLength, expectedOutputBytes(lexical, vector.items.length), vector.name);
    assert.equal(sha256(output), vector.outputSha256, vector.name);
    assert.equal(Buffer.from(output.subarray(0, 16)).toString('hex'), vector.firstItemHeadHex, vector.name);
    assert.equal(sha256(slowLexicalEmbedding(vector.items)), vector.outputSha256, `${vector.name} (independent implementation)`);
  }
});

void test('two independent implementations agree byte for byte on arbitrary text', () => {
  // A small deterministic generator, so a failure can be reproduced.
  let seed = 0x1234abcd;
  const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const alphabet = ['a', 'b', ' ', 'あ', '漢', '🥑', '\n', 'é', '0', '"'];
  for (let round = 0; round < 60; round += 1) {
    const items = Array.from({ length: 1 + (next() % 4) }, () =>
      Array.from({ length: next() % 120 }, () => alphabet[next() % alphabet.length]).join(''));
    assert.deepEqual([...lexicalEmbedding(items)], [...slowLexicalEmbedding(items)], JSON.stringify(items));
  }
});

void test('the lexical embedding places similar text closer than unrelated text', () => {
  const [base, near, far, empty] = [
    lexicalEmbedding(['東京から京都へ新幹線で二時間の旅行計画を立てる']),
    lexicalEmbedding(['東京から京都へ新幹線で二時間半の旅行計画を立てた']),
    lexicalEmbedding(['quarterly revenue grew while operating costs fell']),
    lexicalEmbedding(['']),
  ];
  assert.ok(cosine(base, near) > 0.6, String(cosine(base, near)));
  assert.ok(cosine(base, far) < 0.3, String(cosine(base, far)));
  assert.ok(cosine(base, near) > cosine(base, far) + 0.3);
  assert.equal(empty.every((byte) => byte === 0), true);
  // Every value stays inside the signed 8-bit range the output encoding promises.
  assert.equal([...new Int8Array(base.buffer)].every((value) => value >= -127 && value <= 127), true);
  assert.equal(Math.max(...[...new Int8Array(base.buffer)].map(Math.abs)), 127);
});

void test('lot input framing is exact and refuses text that platforms would encode differently', () => {
  const items = ['一行目\n二行目', 'tab\tand "quotes"'];
  const bytes = encodeLotInput(items);
  assert.equal(new TextDecoder().decode(bytes), JSON.stringify({ schema: 'sky-compute-lot-input/1', items }));
  assert.deepEqual(decodeLotInput(bytes), items);
  assert.equal(wellFormedText('ok 🥑'), true);
  for (const broken of ['\ud83e', 'a\udd51', '\udd51\ud83e'])
    assert.equal(wellFormedText(broken), false);
  assert.throws(() => encodeLotInput(['fine', '\ud800']), /COMPUTE_LOT_INPUT_INVALID/);
  assert.throws(() => encodeLotInput([]), /COMPUTE_LOT_INPUT_INVALID/);
  for (const text of ['{"schema":"other/1","items":["a"]}', '{"schema":"sky-compute-lot-input/1","items":[]}',
    '{"schema":"sky-compute-lot-input/1","items":["a"],"extra":1}', '[]', 'not json'])
    assert.throws(() => decodeLotInput(new TextEncoder().encode(text)), /COMPUTE_LOT_INPUT_INVALID/);
  assert.throws(() => decodeLotInput(Uint8Array.from([0xff, 0xfe])), /COMPUTE_LOT_INPUT_INVALID/);
});

void test('exact SKUs agree only byte for byte', () => {
  const output = lexicalEmbedding(['alpha', 'beta']);
  assert.deepEqual(compareLotOutputs(lexical, 2, output, Uint8Array.from(output)), { agrees: true, minimumCosineBps: null, reason: null });
  const flipped = Uint8Array.from(output);
  flipped[300] ^= 1;
  assert.deepEqual(compareLotOutputs(lexical, 2, output, flipped), { agrees: false, minimumCosineBps: null, reason: 'output_bytes_differ' });
  assert.equal(compareLotOutputs(lexical, 2, output, output.subarray(0, 256)).reason, 'output_length_mismatch');
  assert.equal(invalidLotOutput(lexical, 0, output), 'item_count_invalid');
  assert.equal(invalidLotOutput(lexical, 2, output), null);
});

void test('floating-point SKUs agree by per-item cosine similarity and refuse non-finite values', () => {
  const sku = {
    skuId: 'float-test', title: 'float', status: 'dispatchable',
    artifacts: { runtimeArtifactSha256: 'a'.repeat(64), modelSha256: 'b'.repeat(64), tokenizerSha256: 'c'.repeat(64) },
    input: { maxItemsPerLot: 4, maxInputBytesPerLot: 1024 },
    output: { encoding: 'f32le-vectors/1', dimensions: 4 },
    comparison: { kind: 'cosine', minimumCosineBps: 9_990 },
    reference: null,
  };
  const pack = (...rows) => {
    const buffer = Buffer.alloc(rows.length * 16);
    rows.flat().forEach((value, index) => buffer.writeFloatLE(value, index * 4));
    return new Uint8Array(buffer);
  };
  const reference = pack([1, 2, 3, 4], [0.5, -0.5, 0.25, 0]);
  // Low-order differences, as two chips running the same model produce.
  const jitter = pack([1.0001, 1.9999, 3.0002, 4], [0.50001, -0.49999, 0.25, 0.00001]);
  const close = compareLotOutputs(sku, 2, reference, jitter);
  assert.equal(close.agrees, true);
  assert.ok(close.minimumCosineBps >= 9_999);
  assert.notEqual(sha256(reference), sha256(jitter));
  // One item right and one item wrong is a disagreement: the minimum decides.
  const oneWrong = compareLotOutputs(sku, 2, reference, pack([1, 2, 3, 4], [0.5, 0.5, 0.25, 0]));
  assert.deepEqual([oneWrong.agrees, oneWrong.reason], [false, 'cosine_below_threshold']);
  // Scale does not matter, direction does.
  assert.equal(compareLotOutputs(sku, 2, reference, pack([2, 4, 6, 8], [1, -1, 0.5, 0])).agrees, true);
  assert.equal(compareLotOutputs(sku, 2, reference, pack([-1, -2, -3, -4], [0.5, -0.5, 0.25, 0])).agrees, false);
  // An all-zero item agrees only with an all-zero item.
  assert.equal(compareLotOutputs(sku, 1, pack([0, 0, 0, 0]), pack([0, 0, 0, 0])).agrees, true);
  assert.equal(compareLotOutputs(sku, 1, pack([0, 0, 0, 0]), pack([1, 0, 0, 0])).agrees, false);
  for (const poison of [Number.NaN, Number.POSITIVE_INFINITY]) {
    const bad = pack([1, 2, poison, 4], [0.5, -0.5, 0.25, 0]);
    assert.equal(invalidLotOutput(sku, 2, bad), 'output_not_finite');
    assert.deepEqual([compareLotOutputs(sku, 2, reference, bad).agrees, compareLotOutputs(sku, 2, bad, bad).agrees], [false, false]);
  }
  assert.equal(invalidLotOutput(sku, 2, reference.subarray(0, 31)), 'output_length_mismatch');
});
