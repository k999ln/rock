import { decodeBase64, encodeBase64, decryptBackupEnvelope, encryptBackupEnvelope } from './backup-crypto.ts';

export const DATA_COLLECTION_FORMAT = 'rockstaros-selected-data/1';
export const MAX_COLLECTION_BYTES = 2 * 1024 * 1024;
export const MAX_COLLECTION_FILES = 20;
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_COLLECTION_ENVELOPE_BYTES = MAX_PAYLOAD_BYTES * 2;
export type CollectedFile = { id: string; name: string; size: number; sha256: string; data: string };
export type DataCollection = { format: typeof DATA_COLLECTION_FORMAT; createdAt: string; note: string; files: CollectedFile[] };
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;
function checkName(name: unknown): asserts name is string {
  if (typeof name !== 'string' || !name.trim() || name.length > 255 || name === '.' || name === '..' || name.includes('/') || name.includes('\\') || Array.from(name).some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))
    throw new Error('ファイル名を確認してください。');
}
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
export async function collectSelectedData(files: readonly File[], note: string): Promise<DataCollection> {
  if (typeof note !== 'string' || byteLength(note) > 64 * 1024) throw new Error('メモは64 KiB以内にしてください。');
  if (files.length > MAX_COLLECTION_FILES) throw new Error('ファイルは20件までです。');
  if (!files.length && !note.trim()) throw new Error('ファイルかメモを選んでください。');
  let total = byteLength(note);
  for (const file of files) {
    checkName(file.name);
    if (!Number.isSafeInteger(file.size) || file.size < 0) throw new Error('ファイルのサイズを確認できません。');
    total += file.size;
  }
  if (total > MAX_COLLECTION_BYTES) throw new Error('ファイルとメモの合計は2 MiBまでです。');
  const items: CollectedFile[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength !== file.size) throw new Error('ファイルが変わりました。選び直してください。');
    items.push({ id: crypto.randomUUID(), name: file.name, size: file.size, sha256: await sha256(bytes), data: encodeBase64(bytes) });
  }
  return { format: DATA_COLLECTION_FORMAT, createdAt: new Date().toISOString(), note, files: items };
}
async function validateCollection(value: unknown): Promise<DataCollection> {
  if (!value || typeof value !== 'object') throw new Error('データ回収ファイルの形式が違います。');
  const data = value as DataCollection;
  if (data.format !== DATA_COLLECTION_FORMAT || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt)) ||
      typeof data.note !== 'string' || byteLength(data.note) > 64 * 1024 || !Array.isArray(data.files) || data.files.length > MAX_COLLECTION_FILES)
    throw new Error('データ回収ファイルの形式が違います。');
  let total = byteLength(data.note);
  const ids = new Set<string>();
  const files: CollectedFile[] = [];
  for (const item of data.files) {
    if (!item || typeof item !== 'object') throw new Error('ファイル情報が壊れています。');
    checkName(item.name);
    if (typeof item.id !== 'string' || !/^[a-f0-9-]{36}$/.test(item.id) || ids.has(item.id) ||
        !Number.isSafeInteger(item.size) || item.size < 0 || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.data !== 'string')
      throw new Error('ファイル情報が壊れています。');
    ids.add(item.id);
    total += item.size;
    if (total > MAX_COLLECTION_BYTES || item.data.length > Math.ceil(item.size / 3) * 4)
      throw new Error('データ回収ファイルが大きすぎます。');
    const bytes = decodeBase64(item.data);
    if (bytes.byteLength !== item.size || await sha256(bytes) !== item.sha256)
      throw new Error('ファイルの内容が検証結果と一致しません。');
    files.push({ id: item.id, name: item.name, size: item.size, sha256: item.sha256, data: item.data });
  }
  if (!files.length && !data.note.trim()) throw new Error('保存するデータがありません。');
  return { format: DATA_COLLECTION_FORMAT, createdAt: data.createdAt, note: data.note, files };
}
export async function encryptDataCollection(collection: DataCollection, passphrase: string) {
  const safe = await validateCollection(collection);
  return encryptBackupEnvelope(new TextEncoder().encode(JSON.stringify(safe)), passphrase, DATA_COLLECTION_FORMAT, MAX_PAYLOAD_BYTES);
}
export async function decryptDataCollection(source: string, passphrase: string) {
  const bytes = await decryptBackupEnvelope(source, passphrase, DATA_COLLECTION_FORMAT, MAX_PAYLOAD_BYTES);
  return validateCollection(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}
export function collectedFileBytes(file: CollectedFile) { return decodeBase64(file.data); }
