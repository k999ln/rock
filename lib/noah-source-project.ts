import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { readNoahArchive, safeNoahSourcePath, writeNoahArchive, type NoahArchiveFile } from './noah-source-archive.ts';

export const PROJECT_LIMITS = { files: 64, fileBytes: 128 * 1024, totalBytes: 1024 * 1024 } as const;
export type SourceProject = {
  files: { name: string; content: string }[];
  tests: string[];
  editable: string[];
  root: string;
  digest: string;
};
export const projectCode = (name: string) => /\.(?:[cm]?[jt]s|py)$/i.test(name) && !/\.d\.[cm]?ts$/i.test(name);
export const projectTest = (name: string) => /(?:\.test\.[cm]?[jt]s|(?:^|\/)test_[^/]+\.py)$/i.test(name);
const bytes = (text: string) => new TextEncoder().encode(text);

export async function sourceProject(name: string, input: Uint8Array): Promise<SourceProject> {
  const archive = /\.zip$/i.test(name) ? readNoahArchive(input) : [{ name, bytes: input, attrs: 0, os: 0 }];
  const files: SourceProject['files'] = [];
  let total = 0;
  for (const file of archive) {
    if (file.name.endsWith('/')) continue;
    if (!safeNoahSourcePath(file.name) || file.name.split('/').some(p => p.startsWith('.')) || file.bytes.length > PROJECT_LIMITS.fileBytes)
      throw new NoahAgentError('検証対象には隠しファイルを含めず、各ファイルを128KiB以内にしてください。', 422);
    total += file.bytes.length;
    if (files.length >= PROJECT_LIMITS.files || total > PROJECT_LIMITS.totalBytes)
      throw new NoahAgentError('隔離検証は64ファイル・合計1MiBまでです。原本は変更していません。', 422);
    let content: string;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(file.bytes); }
    catch { throw new NoahAgentError('この検証器はUTF-8のソースとテストを扱います。バイナリを含む原本は変更していません。', 422); }
    if (content.includes('\0')) throw new NoahAgentError('バイナリを含む原本は、この検証器では変更しません。', 422);
    files.push({ name: file.name, content });
  }
  files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const tests = files.filter(f => projectTest(f.name)).map(f => f.name);
  const editable = files.filter(f => projectCode(f.name) && !projectTest(f.name) && !/(?:^|\/)tests?\//i.test(f.name)).map(f => f.name);
  // A fetched repository may retain its outer directory. Resolve modules from
  // the common directory, never from an arbitrary caller-supplied host path.
  const parts = files[0]?.name.split('/').slice(0, -1) || [];
  for (const file of files) { const directories = file.name.split('/').slice(0, -1); while (parts.some((part, i) => directories[i] !== part)) parts.pop(); }
  const root = parts.join('/');
  return { files, tests, editable, root, digest: await noahSha256(bytes(JSON.stringify({ files, tests, root }))) };
}

// The model supplies only replacement contents. File membership, tests,
// metadata, license and provenance remain fixed by the original snapshot.
export async function projectCandidate(original: SourceProject, value: unknown): Promise<SourceProject> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => k !== 'files') ||
    !Array.isArray((value as { files?: unknown }).files)) throw new NoahAgentError('修正結果はfilesを持つJSONで返してください。', 422);
  const edits = new Map<string, string>();
  for (const file of (value as { files: unknown[] }).files) {
    const f = file as { name?: unknown; content?: unknown };
    if (!f || typeof f !== 'object' || Object.keys(f).some(k => !['name', 'content'].includes(k)) || typeof f.name !== 'string' || typeof f.content !== 'string' ||
      !original.editable.includes(f.name) || edits.has(f.name) || bytes(f.content).length > PROJECT_LIMITS.fileBytes || f.content.includes('\0'))
      throw new NoahAgentError('修正結果が固定テスト・原本のファイル構成・容量制限に一致しません。', 422);
    edits.set(f.name, f.content);
  }
  const files = original.files.map(f => ({ name: f.name, content: edits.get(f.name) ?? f.content }));
  if (files.reduce((n, f) => n + bytes(f.content).length, 0) > PROJECT_LIMITS.totalBytes) throw new NoahAgentError('修正後の容量が上限を超えました。', 422);
  return { ...original, files, digest: await noahSha256(bytes(JSON.stringify({ files, tests: original.tests, root: original.root }))) };
}

export function applyProjectCandidate(name: string, input: Uint8Array, candidate: SourceProject) {
  const replacements = new Map(candidate.files.map(f => [f.name, bytes(f.content)]));
  if (!/\.zip$/i.test(name)) return replacements.get(name) ?? input;
  const files: NoahArchiveFile[] = readNoahArchive(input).map(f => ({ ...f, bytes: replacements.get(f.name) ?? f.bytes }));
  return writeNoahArchive(files);
}
