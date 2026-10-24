import { previewProLocalExport } from '../sites/avocado-mini/src/pro-local-import.mjs';
import { encodeBase64, decodeBase64 } from './backup-crypto.ts';

export const PRO_FILE_LIMIT = 262144;
export const PRO_CHUNK_SIZE = 3000;
export const PRO_ARCHIVE_CONSENT = 'archive-private-original';
export const PRO_MANIFEST_ID = 'pro-manifest-v1';
export class ProImportError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status = 400) { super(code); this.code = code; this.status = status; }
}
export function proExact(value: unknown, names: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== names.length || names.some(k => !Object.hasOwn(value, k)))
    throw new ProImportError('INVALID_INPUT');
  return value as Record<string, unknown>;
}
export async function proSha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer)), b => b.toString(16).padStart(2, '0')).join('');
}
export function proFilename(value: unknown): string {
  if (typeof value !== 'string' || !value.length || value.length > 255
    // eslint-disable-next-line no-control-regex -- Reject controls in untrusted file names.
    || /[\\/:*?"<>|\u0000-\u001f\u007f-\u009f]/u.test(value)
    || /[. ]$/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
    throw new ProImportError('INVALID_FILENAME');
  return value;
}
export function proDecode(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(PRO_FILE_LIMIT / 3)) throw new ProImportError('INVALID_FILE');
  try {
    const bytes = decodeBase64(value);
    if (!bytes.length || bytes.length > PRO_FILE_LIMIT || encodeBase64(bytes) !== value) throw new Error();
    return bytes;
  } catch { throw new ProImportError('INVALID_FILE'); }
}
export type ProFile = {
  filename: string; byteLength: number; fileSha256: string; contentSha256: string;
  operationId: string; requestDigest: string; fileBase64: string;
  draft: string; items: { sourceItemId: string; objective: string; legacyChecked: boolean; proposedState: string }[];
};
export async function inspectProFile(filename: unknown, bytes: Uint8Array): Promise<ProFile> {
  const name = proFilename(filename);
  bytes = Uint8Array.from(bytes);
  if (!bytes.length || bytes.length > PRO_FILE_LIMIT) throw new ProImportError('INVALID_FILE');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new ProImportError('INVALID_UTF8'); }
  let preview;
  // A UTF-8 BOM is ignored for parsing only; the stored bytes are never re-encoded.
  try { preview = await previewProLocalExport(text.startsWith('\uFEFF') ? text.slice(1) : text); }
  catch { throw new ProImportError('INVALID_ENVELOPE'); }
  const fileSha256 = await proSha256(bytes);
  const { contentSha256, operationId } = preview.envelope;
  const requestDigest = await proSha256(new TextEncoder().encode(JSON.stringify([
    'pro-account-original/1', name, bytes.length, fileSha256, contentSha256, operationId, PRO_ARCHIVE_CONSENT,
  ])));
  return { filename: name, byteLength: bytes.length, fileSha256, contentSha256, operationId,
    requestDigest, fileBase64: encodeBase64(bytes), draft: preview.draft, items: preview.items };
}
export async function proArchiveId(ownerScope: string, operationId: string) {
  if (!/^owner-v1:[a-f0-9]{64}$/.test(ownerScope) || !/^pro-local-[a-f0-9]{64}$/.test(operationId)) throw new ProImportError('INVALID_INPUT');
  const hex = await proSha256(new TextEncoder().encode(`pro-account-archive-v1\0${ownerScope}\0${operationId}`));
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
export const proPartId = (index: number) => `pro-part-${String(index).padStart(4, '0')}`;
export function proFileMetadata(file: ProFile) {
  return { filename: file.filename, byteLength: file.byteLength, fileSha256: file.fileSha256,
    contentSha256: file.contentSha256, operationId: file.operationId, requestDigest: file.requestDigest,
    chunkCount: Math.ceil(file.fileBase64.length / PRO_CHUNK_SIZE) };
}
