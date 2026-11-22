import { inflateSync, zipSync, type Zippable } from 'fflate';
import { NOAH_SOURCE_LIMIT, NoahAgentError } from './noah-agent-upload.ts';

export const NOAH_ARCHIVE_FILES = 128;
export type NoahArchiveFile = { name: string; bytes: Uint8Array; attrs: number; os: number };
const invalid = () => new NoahAgentError('ZIPのパス・形式・展開上限を確認してください。');
export function safeNoahSourcePath(name: string) {
  return name.length > 0 && name.length <= 240 && !/[\\:]/u.test(name) && !Array.from(name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) &&
    !name.split('/').some(p => !p || p === '.' || p === '..') && name === name.normalize('NFC') &&
    !name.split('/').some(p => ['.git', 'node_modules', '__pycache__'].includes(p.toLowerCase()));
}
export function noahCrc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
// Validate the central directory before allocating any expanded data. Never
// extracts to disk, follows symlinks, evaluates code or loads project config.
export function readNoahArchive(bytes: Uint8Array): NoahArchiveFile[] {
  if (bytes.length > NOAH_SOURCE_LIMIT || bytes.length < 22) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (i: number) => view.getUint16(i, true), u32 = (i: number) => view.getUint32(i, true);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && (u32(end) !== 0x06054b50 || end + 22 + u16(end + 20) !== bytes.length)) end--;
  if (end < 0 || u32(end) !== 0x06054b50 || u16(end + 4) || u16(end + 6)) throw invalid();
  const count = u16(end + 10), directorySize = u32(end + 12), start = u32(end + 16);
  if (count !== u16(end + 8) || count > NOAH_ARCHIVE_FILES || start + directorySize !== end) throw invalid();
  const entries: Array<NoahArchiveFile & { offset: number; compressed: number; expanded: number; crc: number; method: number }> = [];
  const names = new Set<string>(), ranges: Array<[number, number]> = []; let cursor = start, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || u32(cursor) !== 0x02014b50) throw invalid();
    const flags = u16(cursor + 8), method = u16(cursor + 10), compressed = u32(cursor + 20), expanded = u32(cursor + 24);
    const n = u16(cursor + 28), extra = u16(cursor + 30), comment = u16(cursor + 32), local = u32(cursor + 42);
    if (cursor + 46 + n + extra + comment > end || u16(cursor + 34) || (flags & ~0x808) || ![0, 8].includes(method)) throw invalid();
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + n);
    const name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    const directory = name.endsWith('/'), normalized = directory ? name.slice(0, -1) : name;
    const attrs = u32(cursor + 38), os = bytes[cursor + 5], kind = (attrs >>> 16) & 0xf000;
    if (!safeNoahSourcePath(normalized) || names.has(normalized.toLowerCase()) || (os === 3 && kind !== 0 && kind !== (directory ? 0x4000 : 0x8000))) throw invalid();
    names.add(normalized.toLowerCase()); total += expanded;
    if (total > NOAH_SOURCE_LIMIT || (directory && expanded) || (method === 0 && compressed !== expanded) || local + 30 > start || u32(local) !== 0x04034b50 || u16(local + 6) !== flags || u16(local + 8) !== method || u16(local + 26) !== n) throw invalid();
    const offset = local + 30 + n + u16(local + 28);
    if (offset + compressed > start || nameBytes.some((b, j) => b !== bytes[local + 30 + j])) throw invalid();
    ranges.push([local, offset + compressed]);
    entries.push({ name, bytes: new Uint8Array(), attrs, os, offset, compressed, expanded, crc: u32(cursor + 16), method });
    cursor += 46 + n + extra + comment;
  }
  if (cursor !== end) throw invalid();
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((r, i) => i > 0 && ranges[i - 1][1] > r[0])) throw invalid();
  for (const entry of entries) {
    const compressed = bytes.subarray(entry.offset, entry.offset + entry.compressed);
    entry.bytes = entry.method === 0 ? compressed : inflateSync(compressed, new Uint8Array(entry.expanded));
    if (entry.bytes.length !== entry.expanded || noahCrc32(entry.bytes) !== entry.crc) throw invalid();
  }
  return entries.map(({ name, bytes: content, attrs, os }) => ({ name, bytes: content, attrs, os }));
}
export function writeNoahArchive(files: NoahArchiveFile[]) {
  const input: Zippable = Object.create(null) as Zippable;
  for (const file of files) input[file.name] = [file.bytes, { os: file.os, attrs: file.attrs, mtime: new Date('2000-01-01T00:00:00Z') }];
  return zipSync(input, { level: 6 });
}
