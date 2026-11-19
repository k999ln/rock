/** Local registered-appearance comparison. This is not semantic image understanding. */
export const SMIS_VISUAL_SIDE = 64;
export const SMIS_VISUAL_MAX_AGE = 10_000;
export type SmisVisualFingerprint = {
  schema: 'smis.visual-fingerprint/1';
  layout: number[];
  edges: number[];
  histogram: number[];
  detail: number;
};
export type SmisVisualObservation = {
  schema: 'smis.visual-observation/1';
  source: 'browser-camera' | 'mini-camera';
  observedAt: number;
  fingerprint: SmisVisualFingerprint;
};
export type SmisVisualReference = {
  schema: 'smis.visual-reference/1';
  owner: string;
  agentId: string;
  agentRevision: number;
  objectName: string;
  samples: SmisVisualFingerprint[];
  background: SmisVisualFingerprint;
};
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k));
const vector = (value: unknown, count: number): value is number[] => Array.isArray(value) && value.length === count && value.every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
function label(value: unknown, max: number): value is string {
  if (typeof value !== 'string' || !value.length || value.length > max) return false;
  for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) < 32 || value.charCodeAt(i) === 127) return false;
  return true;
}
export function parseSmisVisualFingerprint(value: unknown): SmisVisualFingerprint {
  if (!exact(value, ['schema', 'layout', 'edges', 'histogram', 'detail']) || value.schema !== 'smis.visual-fingerprint/1' ||
      !vector(value.layout, 192) || !vector(value.edges, 64) || !vector(value.histogram, 24) || typeof value.detail !== 'number' || !Number.isFinite(value.detail) || value.detail < 0 || value.detail > 1)
    throw Error('映像を読み取れません。明るさや向きを変えて試してください。');
  return value as SmisVisualFingerprint;
}
/** Shared pixel interface: a Mini driver can supply the same 64x64 RGBA pixels. */
export function observeSmisPixels(pixels: Uint8ClampedArray, source: SmisVisualObservation['source'], observedAt: number): SmisVisualObservation {
  if (!(pixels instanceof Uint8ClampedArray) || pixels.length !== SMIS_VISUAL_SIDE ** 2 * 4 || !['browser-camera', 'mini-camera'].includes(source) || !Number.isSafeInteger(observedAt) || observedAt < 0)
    throw Error('カメラの情報を確認してください。');
  const layout = Array<number>(192).fill(0), edges = Array<number>(64).fill(0), histogram = Array<number>(24).fill(0), gray = new Float64Array(4096);
  let sum = 0, squared = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = y * 64 + x, cell = Math.floor(y / 8) * 8 + Math.floor(x / 8);
    if (pixels[i * 4 + 3] !== 255) throw Error('カメラの映像がまだ届いていません。');
    for (let channel = 0; channel < 3; channel++) {
      const value = pixels[i * 4 + channel] / 255;
      layout[cell * 3 + channel] += value / 64;
      histogram[channel * 8 + Math.min(7, Math.floor(value * 8))] += 1 / 4096;
    }
    const luminance = (pixels[i * 4] * 0.299 + pixels[i * 4 + 1] * 0.587 + pixels[i * 4 + 2] * 0.114) / 255;
    gray[i] = luminance; sum += luminance; squared += luminance ** 2;
  }
  for (let y = 1; y < 63; y++) for (let x = 1; x < 63; x++) {
    const i = y * 64 + x, cell = Math.floor(y / 8) * 8 + Math.floor(x / 8);
    edges[cell] += (Math.abs(gray[i + 1] - gray[i - 1]) + Math.abs(gray[i + 64] - gray[i - 64])) / 128;
  }
  const round = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000;
  return { schema: 'smis.visual-observation/1', source, observedAt, fingerprint: {
    schema: 'smis.visual-fingerprint/1', layout: layout.map(round), edges: edges.map(round), histogram: histogram.map(round),
    detail: round(Math.sqrt(Math.max(0, squared / 4096 - (sum / 4096) ** 2))),
  } };
}
export function smisVisualSimilarity(left: SmisVisualFingerprint, right: SmisVisualFingerprint) {
  const a = parseSmisVisualFingerprint(left), b = parseSmisVisualFingerprint(right);
  const layoutDistance = a.layout.reduce((n, value, i) => n + Math.abs(value - b.layout[i]), 0) / 192;
  const histogramDistance = a.histogram.reduce((n, value, i) => n + Math.abs(value - b.histogram[i]), 0) / 6;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < 64; i++) { dot += a.edges[i] * b.edges[i]; aa += a.edges[i] ** 2; bb += b.edges[i] ** 2; }
  const edgeSimilarity = aa > 0.00001 && bb > 0.00001 ? dot / Math.sqrt(aa * bb) : 0;
  return Math.max(0, Math.min(1, 0.55 * Math.max(0, 1 - layoutDistance / 0.25) + 0.25 * (1 - histogramDistance) + 0.2 * edgeSimilarity));
}
export function parseSmisVisualReference(value: unknown): SmisVisualReference {
  if (!exact(value, ['schema', 'owner', 'agentId', 'agentRevision', 'objectName', 'samples', 'background']) || value.schema !== 'smis.visual-reference/1' ||
      !label(value.owner, 256) || !label(value.agentId, 120) || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(value.agentId) ||
      !Number.isSafeInteger(value.agentRevision) || (value.agentRevision as number) < 1 || !label(value.objectName, 40) || !Array.isArray(value.samples) || value.samples.length !== 3)
    throw Error('覚えた対象の設定を確認してください。');
  const samples = value.samples.map(parseSmisVisualFingerprint), background = parseSmisVisualFingerprint(value.background);
  if (samples.some(sample => sample.detail < 0.05 || sample.edges.reduce((a, b) => a + b, 0) < 0.25))
    throw Error('見分ける手がかりが少ないため、背景や向きを変えて覚え直してください。');
  if (samples.some(sample => smisVisualSimilarity(sample, background) >= 0.85))
    throw Error('対象と背景を見分けにくい状態です。違う色の下敷きなどを使って覚え直してください。');
  return { schema: 'smis.visual-reference/1', owner: value.owner, agentId: value.agentId, agentRevision: value.agentRevision as number, objectName: value.objectName, samples, background };
}
export function matchSmisVisualObservation(value: SmisVisualObservation, references: SmisVisualReference[], owner: string, now: number) {
  if (!exact(value, ['schema', 'source', 'observedAt', 'fingerprint']) || value.schema !== 'smis.visual-observation/1' || !['browser-camera', 'mini-camera'].includes(value.source) ||
      !Number.isSafeInteger(now) || !Number.isSafeInteger(value.observedAt) || value.observedAt > now || now - value.observedAt > SMIS_VISUAL_MAX_AGE)
    throw Error('映像が古くなりました。もう一度、今の対象を確認してください。');
  const fingerprint = parseSmisVisualFingerprint(value.fingerprint);
  if (references.length > 10) throw Error('覚えた対象が多すぎます。不要な登録を外してください。');
  const candidates = references.map(parseSmisVisualReference).filter(ref => ref.owner === owner).map(reference => ({
    reference, score: Math.max(...reference.samples.map(sample => smisVisualSimilarity(sample, fingerprint))),
    backgroundScore: smisVisualSimilarity(reference.background, fingerprint),
  })).sort((a, b) => b.score - a.score);
  const best = candidates[0], next = candidates[1];
  const matched = fingerprint.detail >= 0.05 && best && best.score >= 0.90 && best.score - best.backgroundScore >= 0.08 && (!next || best.score - next.score >= 0.08);
  return { candidate: matched ? best.reference : null, observedAt: value.observedAt, source: value.source,
    authorizationGranted: false as const, physicalActionAccepted: false as const, semanticImageUnderstanding: false as const };
}
export const SMIS_VISUAL_STORAGE_KEY = 'smis.visual.references.v1';
export function smisVisualStorageKey(owner: string) {
  if (!label(owner, 256)) throw Error('自分のアカウントを確認してください。');
  return `${SMIS_VISUAL_STORAGE_KEY}:${encodeURIComponent(owner)}`;
}
export function readSmisVisualReferences(storage: Pick<Storage, 'getItem'>, owner: string, agents: { id: string; revision: number; enabled: boolean; attachment?: { objectName: string } }[]): SmisVisualReference[] {
  const raw = storage.getItem(smisVisualStorageKey(owner));
  if (!raw) return [];
  if (raw.length > 150_000) throw Error('覚えた対象の保存量が上限を超えています。');
  let entries: unknown;
  try { entries = JSON.parse(raw); } catch { throw Error('覚えた対象を読めません。登録を消して覚え直してください。'); }
  if (!Array.isArray(entries) || entries.length > 10) throw Error('覚えた対象の保存形式を確認してください。');
  return entries.map(parseSmisVisualReference).filter(ref => ref.owner === owner && agents.some(a => a.id === ref.agentId && a.revision === ref.agentRevision && a.enabled && a.attachment?.objectName === ref.objectName));
}
export function saveSmisVisualReference(storage: Pick<Storage, 'getItem' | 'setItem'>, value: SmisVisualReference, agents: { id: string; revision: number; enabled: boolean; attachment?: { objectName: string } }[]) {
  const ref = parseSmisVisualReference(value);
  const all = readSmisVisualReferences(storage, ref.owner, agents).filter(r => r.agentId !== ref.agentId);
  if (!agents.some(a => a.id === ref.agentId && a.revision === ref.agentRevision && a.enabled && a.attachment?.objectName === ref.objectName) || all.length >= 10) throw Error('担当が変わったか、登録数が上限です。担当を確認してください。');
  const encoded = JSON.stringify([...all, ref]);
  if (encoded.length > 150_000) throw Error('覚えた対象の保存量が上限を超えています。');
  storage.setItem(smisVisualStorageKey(ref.owner), encoded);
}
