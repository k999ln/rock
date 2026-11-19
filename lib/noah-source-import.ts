import { NoahAgentError, noahSha256 } from './noah-agent-upload.ts';
import { safeNoahSourcePath, writeNoahArchive, type NoahArchiveFile } from './noah-source-archive.ts';

type Repository = { provider: 'github' | 'huggingface'; kind: 'models' | 'spaces' | 'datasets'; owner: string; repo: string; url: string };
const fail = (message: string, status = 400) => new NoahAgentError(message, status);
export function noahSourceRepository(value: unknown): Repository {
  if (typeof value !== 'string' || value.length > 500) throw fail('公開リポジトリのURLを指定してください。');
  let url: URL; try { url = new URL(value); } catch { throw fail('リポジトリのURLを確認してください。'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || !['github.com', 'huggingface.co'].includes(url.hostname)) throw fail('GitHubまたはHugging Faceの公開リポジトリURLを指定してください。');
  const parts = url.pathname.replace(/\/$/, '').split('/').slice(1);
  const provider = url.hostname === 'github.com' ? 'github' : 'huggingface';
  let kind: Repository['kind'] = 'models';
  if (provider === 'huggingface' && ['spaces', 'datasets'].includes(parts[0])) kind = parts.shift() as Repository['kind'];
  if (parts.length !== 2 || parts.some(p => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(p) || p === '..')) throw fail('ファイルやブランチではなく、リポジトリのトップURLを指定してください。');
  const [owner, original] = parts, repo = provider === 'github' ? original.replace(/\.git$/, '') : original;
  return { provider, kind, owner, repo, url: `https://${url.hostname}/${provider === 'huggingface' && kind !== 'models' ? `${kind}/` : ''}${owner}/${repo}` };
}
const sourceFile = (name: string) => safeNoahSourcePath(name) &&
  (/\.(?:[cm]?js|jsx|[cm]?ts|tsx|py|rs|go|java|kt|sh|json|toml|ya?ml|md|txt|lock)$/i.test(name) || /(?:^|\/)(?:license(?:\..*)?|copying|notice|readme|dockerfile|makefile)$/i.test(name)) &&
  !name.split('/').some(p => p.startsWith('.') && !['.github'].includes(p));
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export async function importNoahSource(input: unknown, fetcher: typeof fetch = fetch) {
  const value = object(input);
  if (Object.keys(value).some(k => !['url', 'revision', 'rightsConfirmed'].includes(k)) || value.rightsConfirmed !== true) throw fail('取得するコードを保存する権利を確認してください。');
  const repository = noahSourceRepository(value.url);
  const revision = value.revision || (repository.provider === 'github' ? 'HEAD' : 'main');
  if (typeof revision !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,99}$/.test(revision) || revision.includes('..')) throw fail('取得する版を確認してください。');
  const signal = AbortSignal.timeout(60000);
  async function read(url: string, limit: number, redirects = 0): Promise<Uint8Array> {
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: url.startsWith('https://api.github.com/') ? 'application/vnd.github+json' : '*/*', 'User-Agent': 'Noah-Source-Import/1' } });
    if (response.status >= 300 && response.status < 400) {
      const target = new URL(response.headers.get('location') || '', url);
      await response.body?.cancel();
      if (redirects >= 2 || target.origin !== 'https://huggingface.co' || target.username || target.password || !target.pathname.startsWith('/api/resolve-cache/')) throw fail('外部配布先への転送が必要です。コードのZIPを選んで追加してください。', 422);
      return read(target.href, limit, redirects + 1);
    }
    if (!response.ok) { await response.body?.cancel(); throw fail(response.status === 429 || response.status === 403 ? '取得先の利用条件または回数制限を確認してください。' : '公開リポジトリと指定した版を取得できません。', 422); }
    const size = Number(response.headers.get('content-length'));
    if (size > limit) { await response.body?.cancel(); throw fail('コード取込の容量上限を超えています。必要なコードをZIPで選んで追加してください。', 413); }
    const reader = response.body?.getReader(); if (!reader) throw fail('取得先から内容が返りませんでした。', 502);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > limit) { await reader.cancel(); throw fail('コード取込の容量上限を超えています。', 413); } chunks.push(part.value); }
    const bytes = new Uint8Array(length); let offset = 0; for (const part of chunks) { bytes.set(part, offset); offset += part.length; } return bytes;
  }
  const readJson = async (url: string) => object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await read(url, 1024 * 1024))));
  let commit: unknown, paths: string[];
  const excluded = new Set<string>();
  const repoPath = `${repository.owner}/${repository.repo}`;
  if (repository.provider === 'github') {
    const metadata = await readJson(`https://api.github.com/repos/${repoPath}/commits/${encodeURIComponent(revision)}`);
    commit = metadata.sha;
    if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit)) throw fail('固定commitを確認できません。', 422);
    const tree = await readJson(`https://api.github.com/repos/${repoPath}/git/trees/${commit}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw fail('リポジトリが大きすぎます。必要なコードをZIPで追加してください。', 413);
    // Do not turn symlinks or git submodules into source files.
    const entries = tree.tree.map(object).filter(f => f.type !== 'tree');
    paths = entries.map(f => typeof f.path === 'string' ? f.path : '');
    for (const entry of entries) if (entry.type !== 'blob' || !['100644', '100755'].includes(String(entry.mode))) excluded.add(typeof entry.path === 'string' ? entry.path : '');
  } else {
    const metadata = await readJson(`https://huggingface.co/api/${repository.kind}/${repoPath}/revision/${encodeURIComponent(revision)}`);
    commit = metadata.sha;
    if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit) || !Array.isArray(metadata.siblings)) throw fail('固定commitとファイル一覧を確認できません。', 422);
    if (metadata.gated || metadata.private) throw fail('非公開・利用条件付きのリポジトリは本人用の接続が必要です。', 422);
    paths = metadata.siblings.map(object).map(f => typeof f.rfilename === 'string' ? f.rfilename : '');
  }
  const selected = paths.filter(name => sourceFile(name) && !excluded.has(name)).sort();
  if (!selected.length || selected.length > 32 || new Set(selected.map(p => p.toLowerCase())).size !== selected.length) throw fail('URLから取得できるコードは1〜32ファイルです。必要なコードをZIPで選んで追加してください。', 413);
  if (selected.some(p => p.toLowerCase() === 'noah-import.json')) throw fail('取得記録と同名のファイルがあります。ZIPで追加してください。');
  const files: NoahArchiveFile[] = [], records: Array<{ name: string; sha256: string; bytes: number }> = []; let total = 0;
  for (const name of selected) {
    const encoded = name.split('/').map(encodeURIComponent).join('/');
    const url = repository.provider === 'github' ? `https://raw.githubusercontent.com/${repoPath}/${commit}/${encoded}` : `https://huggingface.co/${repository.kind === 'models' ? '' : repository.kind + '/'}${repoPath}/resolve/${commit}/${encoded}`;
    const bytes = await read(url, Math.min(512 * 1024, 8 * 1024 * 1024 - total));
    total += bytes.length;
    files.push({ name, bytes, os: 3, attrs: 0o100644 << 16 }); records.push({ name, bytes: bytes.length, sha256: await noahSha256(bytes) });
  }
  const record = { schema: 'noah-source-import/1', url: repository.url, commit, scope: 'source-files-only', omittedFiles: paths.length - selected.length, files: records };
  files.push({ name: 'noah-import.json', bytes: new TextEncoder().encode(JSON.stringify(record, null, 2)), attrs: 0o100644 << 16, os: 3 });
  return { bytes: writeNoahArchive(files), name: `${repository.repo.slice(0, 80)}-${commit.slice(0, 8)}.zip`, record };
}
