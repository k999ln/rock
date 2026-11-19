// Reviewed local model versions. Mutable provider tags are never readiness proof.
export const NOAH_MODELS = Object.freeze([
  Object.freeze({
    id: 'qwen2.5:1.5b',
    name: 'Qwen 2.5 · 1.5B',
    digest: '65ec06548149b04c096a120e4a6da9d4017ea809c91734ea5631e89f96ddc57b',
    bytes: 986061892,
    license: 'Apache-2.0',
    source: 'https://ollama.com/library/qwen2.5:1.5b',
    derivedFrom: null,
  }),
  Object.freeze({
    id: 'qwen3:4b',
    name: 'Qwen 3 · 4B',
    digest: '359d7dd4bcdab3d86b87d73ac27966f4dbb9f5efdfcc75d34a8764a09474fae7',
    bytes: 2497293931,
    license: 'Apache-2.0',
    source: 'https://ollama.com/library/qwen3:4b',
    derivedFrom: null,
  }),
  Object.freeze({
    id: 'qwen2.5-tools:1.5b-v1',
    name: 'Qwen 2.5 · 1.5B（Tool接続版）',
    digest: '51ba27975e0ff834e9d0208a8201a35ad174662ed5d624db46d6ba78e3808e84',
    bytes: 986061525,
    license: 'Apache-2.0',
    source: 'https://ollama.com/library/qwen2.5:1.5b',
    derivedFrom: Object.freeze({
      id: 'qwen2.5:1.5b',
      transform: 'tool-functions-json/1',
      templateSha256: 'eb4402837c7829a690fa845de4d7f3fd842c2adee476d5341da8a46ea9255175',
      resultTemplateSha256: '9e526123f197acde65c7710224e35f9b2aacb1120f6c524e2e862a21d831bd7b',
    }),
  }),
]);
export const noahModel = (id) => NOAH_MODELS.find((m) => m.id === id);
export const noahModelDigest = (id) => noahModel(id)?.digest;
