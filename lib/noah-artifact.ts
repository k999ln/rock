import { NoahAgentError, NOAH_SOURCE_LIMIT, noahUploadId, noahSha256 } from './noah-agent-upload.ts';
import { parseTerminalRuntime } from './noah-terminal-contract.mjs';

export type NoahArtifact = {
  schema: 'noah-source/1'; uploadId: string; uploadManifestSha256: string;
  sha256: string; originalSha256: string; name: string; bytes: number;
  runtime?: ReturnType<typeof parseTerminalRuntime>;
};
export function parseNoahArtifact(value: unknown): NoahArtifact {
  const v = value as NoahArtifact;
  const keys = ['schema', 'uploadId', 'uploadManifestSha256', 'sha256', 'originalSha256', 'name', 'bytes', ...(v && Object.hasOwn(v, 'runtime') ? ['runtime'] : [])];
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).length !== keys.length || keys.some(k => !(k in v)) ||
    v.schema !== 'noah-source/1' || [v.uploadManifestSha256, v.sha256, v.originalSha256].some(x => typeof x !== 'string' || !/^[a-f0-9]{64}$/.test(x)) ||
    typeof v.name !== 'string' || !/^[^/\\.][^/\\]{0,119}$/.test(v.name) || Array.from(v.name).some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    !Number.isSafeInteger(v.bytes) || v.bytes < 4 || v.bytes > NOAH_SOURCE_LIMIT) throw new NoahAgentError('配布ファイルの固定版を確認してください。');
  return { schema: 'noah-source/1', uploadId: noahUploadId(v.uploadId), uploadManifestSha256: v.uploadManifestSha256,
    sha256: v.sha256, originalSha256: v.originalSha256, name: v.name, bytes: v.bytes,
    ...(Object.hasOwn(v, 'runtime') ? { runtime: parseTerminalRuntime(v.runtime) } : {}) };
}
export async function noahArtifactKey(owner: string, sha256: string) {
  return `noah/releases/${await noahSha256(new TextEncoder().encode(owner))}/${sha256}`;
}
export async function verifiedArtifactBytes(object: { body: ReadableStream<Uint8Array> }, pin: Pick<NoahArtifact, 'bytes' | 'sha256'>) {
  const reader = object.body.getReader(), parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const next = await reader.read(); if (next.done) break;
    size += next.value.byteLength;
    if (size > pin.bytes || size > NOAH_SOURCE_LIMIT) { await reader.cancel(); throw new NoahAgentError('配布ファイルの大きさが固定版と一致しません。', 409); }
    parts.push(next.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  if (size !== pin.bytes || await noahSha256(bytes) !== pin.sha256) throw new NoahAgentError('配布ファイルと固定hashが一致しません。', 409);
  return bytes;
}
