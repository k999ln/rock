// Sky Compute Grid — reviewed workload (SKU) registry.
//
// A device never receives code. It receives a SKU id plus the three artifact
// digests below and runs the implementation that shipped inside its signed
// app. An order or offer is admitted only when its digests equal the entry in
// this registry, so "any 64 hex characters that agree with each other" is no
// longer enough to pass matching or verification.

export type ComputeSkuArtifacts = {
  runtimeArtifactSha256: string;
  modelSha256: string;
  tokenizerSha256: string;
};

export type ComputeSkuComparison =
  | { kind: 'exact' }
  // Per-item cosine similarity in basis points (10_000 = identical direction).
  | { kind: 'cosine'; minimumCosineBps: number };

export type ComputeSkuDefinition = {
  skuId: string;
  title: string;
  // `dispatchable` SKUs can be ordered and leased by the persistent grid.
  // `fixture_only` SKUs exist for the synthetic host fixture and are refused
  // by the persistent grid until a real engine and its digests are reviewed.
  status: 'dispatchable' | 'fixture_only';
  artifacts: ComputeSkuArtifacts;
  input: { maxItemsPerLot: number; maxInputBytesPerLot: number };
  output: { encoding: 'i8-vectors/1' | 'f32le-vectors/1'; dimensions: number };
  comparison: ComputeSkuComparison;
  // Present only when the coordinator can recompute a lot itself.
  reference: ((items: readonly string[]) => Uint8Array) | null;
};

export const COMPUTE_LOT_INPUT_SCHEMA = 'sky-compute-lot-input/1' as const;
export const LEXICAL_EMBEDDING_SKU = 'text-lexical-embedding-v1' as const;
export const FIXTURE_EMBEDDING_SKU = 'public-text-embedding-v1' as const;
export const LEXICAL_EMBEDDING_DIMENSIONS = 256;

// The three strings below are the normative description of
// text-lexical-embedding-v1. Their SHA-256 digests are the artifact digests,
// so changing the algorithm without changing the digests fails the tests in
// tests/sky-compute-grid-skus.test.mjs.
export const LEXICAL_EMBEDDING_RUNTIME_SPEC = [
  'sky-compute-runtime/text-lexical-embedding/1',
  'input=sky-compute-lot-input/1 items[] as well-formed UTF-8 bytes',
  'ngrams=2,3,4 bytes, sliding by one byte',
  'hash=fnv1a32(seed 0x811c9dc5, prime 0x01000193) over [n, gram bytes] then murmur3 fmix32',
  'bucket=hash & 0xff',
  'sign=((hash >>> 8) & 1) ? -1 : +1',
  'counts=int32[256] sum of signs',
  'quantize=sign(c) * floor((|c| * 254 + max) / (2 * max)), max = max |c|, all zero when max = 0',
  'output=i8-vectors/1, 256 bytes per item, items concatenated in order',
  '',
].join('\n');
export const LEXICAL_EMBEDDING_MODEL_SPEC =
  'sky-compute-model/text-lexical-embedding/1\ndimensions=256\nngrams=2,3,4\nweights=none\n';
export const LEXICAL_EMBEDDING_TOKENIZER_SPEC =
  'sky-compute-tokenizer/utf8-bytes/1\nnormalization=none\nlone-surrogates=rejected-before-dispatch\n';

const lexicalArtifacts: ComputeSkuArtifacts = {
  runtimeArtifactSha256: '2b83ef14061ea53c5825cede9ee7e79f953ad10f86815bc41bcc11a9a3832c2a',
  modelSha256: '10e63d0a4ed7f16a5c42b0c806787b4aba61fa5930e86e79610daa028800d3d5',
  tokenizerSha256: '0148e10d32030fbaee7eedf967db70a3b7665da854faeb0f87ecd8e3659381a5',
};

function utf8(value: string) {
  return new TextEncoder().encode(value);
}

/** Lone surrogates encode differently on Android and V8, so they are refused. */
export function wellFormedText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return false;
  }
  return true;
}

/** The exact bytes a device hashes and computes on. */
export function encodeLotInput(items: readonly string[]) {
  if (!Array.isArray(items) || items.length < 1 || !items.every(wellFormedText))
    throw new Error('COMPUTE_LOT_INPUT_INVALID');
  return utf8(JSON.stringify({ schema: COMPUTE_LOT_INPUT_SCHEMA, items }));
}

export function decodeLotInput(bytes: Uint8Array) {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Error('COMPUTE_LOT_INPUT_INVALID');
  }
  const record = value as { schema?: unknown; items?: unknown };
  if (!record || typeof record !== 'object' || Array.isArray(record) ||
      Object.keys(record).length !== 2 || record.schema !== COMPUTE_LOT_INPUT_SCHEMA ||
      !Array.isArray(record.items) || record.items.length < 1 ||
      !record.items.every(wellFormedText))
    throw new Error('COMPUTE_LOT_INPUT_INVALID');
  return record.items as string[];
}

function fmix32(value: number) {
  let hash = value;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

/** Integer-only byte n-gram feature hashing; bit-identical on every platform. */
export function lexicalEmbedding(items: readonly string[]) {
  const output = new Uint8Array(items.length * LEXICAL_EMBEDDING_DIMENSIONS);
  const counts = new Int32Array(LEXICAL_EMBEDDING_DIMENSIONS);
  items.forEach((item, itemIndex) => {
    if (!wellFormedText(item)) throw new Error('COMPUTE_LOT_INPUT_INVALID');
    const bytes = utf8(item);
    counts.fill(0);
    for (const gram of [2, 3, 4]) {
      for (let start = 0; start + gram <= bytes.length; start += 1) {
        let hash = 0x811c9dc5;
        hash = Math.imul(hash ^ gram, 0x01000193);
        for (let offset = 0; offset < gram; offset += 1)
          hash = Math.imul(hash ^ bytes[start + offset], 0x01000193);
        hash = fmix32(hash >>> 0);
        counts[hash & 0xff] += ((hash >>> 8) & 1) === 1 ? -1 : 1;
      }
    }
    let maximum = 0;
    for (const count of counts) maximum = Math.max(maximum, Math.abs(count));
    if (maximum === 0) return;
    const base = itemIndex * LEXICAL_EMBEDDING_DIMENSIONS;
    for (let index = 0; index < LEXICAL_EMBEDDING_DIMENSIONS; index += 1) {
      const count = counts[index];
      const magnitude = Math.floor((Math.abs(count) * 254 + maximum) / (2 * maximum));
      output[base + index] = (count < 0 ? -magnitude : magnitude) & 0xff;
    }
  });
  return output;
}

const registry = new Map<string, ComputeSkuDefinition>([
  [LEXICAL_EMBEDDING_SKU, {
    skuId: LEXICAL_EMBEDDING_SKU,
    title: '文字n-gramの字句embedding（整数演算・256次元）',
    status: 'dispatchable',
    artifacts: lexicalArtifacts,
    input: { maxItemsPerLot: 256, maxInputBytesPerLot: 65_536 },
    output: { encoding: 'i8-vectors/1', dimensions: LEXICAL_EMBEDDING_DIMENSIONS },
    comparison: { kind: 'exact' },
    reference: lexicalEmbedding,
  }],
  // The synthetic host fixture. No engine is selected, so its digests are the
  // fixture's placeholders and the persistent grid refuses to dispatch it.
  [FIXTURE_EMBEDDING_SKU, {
    skuId: FIXTURE_EMBEDDING_SKU,
    title: '公開text embedding（host fixture専用。実行engineは未選定）',
    status: 'fixture_only',
    artifacts: {
      runtimeArtifactSha256: '1'.repeat(64),
      modelSha256: '2'.repeat(64),
      tokenizerSha256: '3'.repeat(64),
    },
    input: { maxItemsPerLot: 1_000, maxInputBytesPerLot: 262_144 },
    output: { encoding: 'f32le-vectors/1', dimensions: 384 },
    comparison: { kind: 'cosine', minimumCosineBps: 9_900 },
    reference: null,
  }],
]);

export type ComputeSkuRegistry = ReadonlyMap<string, ComputeSkuDefinition>;
export const COMPUTE_SKUS: ComputeSkuRegistry = registry;

export function sameArtifacts(left: ComputeSkuArtifacts, right: ComputeSkuArtifacts) {
  return left.runtimeArtifactSha256 === right.runtimeArtifactSha256 &&
    left.modelSha256 === right.modelSha256 &&
    left.tokenizerSha256 === right.tokenizerSha256;
}

export function skuForArtifacts(
  artifacts: ComputeSkuArtifacts,
  skus: ComputeSkuRegistry = COMPUTE_SKUS,
) {
  for (const sku of skus.values()) if (sameArtifacts(sku.artifacts, artifacts)) return sku;
  return null;
}

function bytesPerItem(sku: ComputeSkuDefinition) {
  return sku.output.dimensions * (sku.output.encoding === 'f32le-vectors/1' ? 4 : 1);
}

export function expectedOutputBytes(sku: ComputeSkuDefinition, itemCount: number) {
  return bytesPerItem(sku) * itemCount;
}

function floatVector(bytes: Uint8Array, item: number, dimensions: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset + item * dimensions * 4, dimensions * 4);
  const vector = new Float64Array(dimensions);
  for (let index = 0; index < dimensions; index += 1) vector[index] = view.getFloat32(index * 4, true);
  return vector;
}

/** Structural check of one lot output. Returns a reason, or null when valid. */
export function invalidLotOutput(sku: ComputeSkuDefinition, itemCount: number, bytes: Uint8Array) {
  if (!Number.isSafeInteger(itemCount) || itemCount < 1) return 'item_count_invalid';
  if (bytes.byteLength !== expectedOutputBytes(sku, itemCount)) return 'output_length_mismatch';
  if (sku.output.encoding === 'f32le-vectors/1') {
    for (let item = 0; item < itemCount; item += 1)
      for (const value of floatVector(bytes, item, sku.output.dimensions))
        if (!Number.isFinite(value)) return 'output_not_finite';
  }
  return null;
}

function cosineBps(left: Float64Array | Int8Array, right: Float64Array | Int8Array) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  // Two empty items agree; an empty item never agrees with a non-empty one.
  if (leftNorm === 0 && rightNorm === 0) return 10_000;
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return Math.floor((dot / Math.sqrt(leftNorm * rightNorm)) * 10_000);
}

/**
 * Decide whether two independently produced outputs of the same lot agree.
 * Exact SKUs must match byte for byte. Floating-point SKUs are compared per
 * item by cosine similarity, because the same model yields slightly different
 * low-order bits on different chips.
 */
export function compareLotOutputs(
  sku: ComputeSkuDefinition,
  itemCount: number,
  left: Uint8Array,
  right: Uint8Array,
): { agrees: boolean; minimumCosineBps: number | null; reason: string | null } {
  const invalid = invalidLotOutput(sku, itemCount, left) ?? invalidLotOutput(sku, itemCount, right);
  if (invalid) return { agrees: false, minimumCosineBps: null, reason: invalid };
  if (sku.comparison.kind === 'exact') {
    for (let index = 0; index < left.byteLength; index += 1)
      if (left[index] !== right[index]) return { agrees: false, minimumCosineBps: null, reason: 'output_bytes_differ' };
    return { agrees: true, minimumCosineBps: null, reason: null };
  }
  const { dimensions } = sku.output;
  let minimum = 10_000;
  for (let item = 0; item < itemCount; item += 1) {
    const similarity = sku.output.encoding === 'f32le-vectors/1'
      ? cosineBps(floatVector(left, item, dimensions), floatVector(right, item, dimensions))
      : cosineBps(
          new Int8Array(left.buffer, left.byteOffset + item * dimensions, dimensions),
          new Int8Array(right.buffer, right.byteOffset + item * dimensions, dimensions),
        );
    minimum = Math.min(minimum, similarity);
  }
  const agrees = minimum >= sku.comparison.minimumCosineBps;
  return { agrees, minimumCosineBps: minimum, reason: agrees ? null : 'cosine_below_threshold' };
}
