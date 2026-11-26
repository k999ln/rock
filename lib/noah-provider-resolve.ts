/** Discover executable metadata from the listed distribution, never from an aggregator's prose. */
import type { DirectoryEntry } from './noah-agent-directory.ts';
import { noahRevenueTarget } from './noah-revenue-directory.ts';
import { NoahAgentError } from './noah-agent-upload.ts';
import { noahSourceRepository } from './noah-source-import.ts';
import { draftFromRegistry, type RegistryServer } from './noah-intake-draft.ts';
import { object, providerBytes } from './noah-gradio.ts';

export type NoahProviderTarget =
  | { kind: 'space'; repository: string }
  | { kind: 'mcp'; repository: string; url: string; provenance: string };
export class NoahProviderInformationError extends NoahAgentError {
  readonly field: string;
  constructor(field: string, message: string) { super(message, 422); this.field = field; }
}
const missing = () => new NoahProviderInformationError('公開された接続先・実行方法', '公式配布元から、Noahで利用できるMCP接続先URLまたはAPIの定義を確認できませんでした。紹介ページやソースコードだけでは接続先を特定できません。提供元の接続定義、または対応する実行環境が必要です。');
const github = (value: unknown) => {
  try { const r = noahSourceRepository(value); return r.provider === 'github' ? r : null; } catch { return null; }
};
function githubRoot(value: string): { root: string; repository: string } | null {
  const repo = github(value);
  if (repo) return { root: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD`, repository: repo.url };
  try {
    const u = new URL(value);
    if (u.origin !== 'https://github.com' || u.username || u.password || u.search || u.hash) return null;
    const match = /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/tree\/([a-f0-9]{40})\/([A-Za-z0-9_./-]+)\/?$/.exec(u.pathname);
    if (!match || [match[1], match[2], ...match[4].split('/')].some(p => !p || p === '..' || p === '.')) return null;
    return { root: `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}/${match[4]}`, repository: u.href };
  } catch { return null; }
}
const packageName = (value: unknown): string | null => {
  try {
    const u = new URL(String(value));
    if (u.protocol !== 'https:' || !['www.npmjs.com', 'npmjs.com'].includes(u.hostname) || u.username || u.password || u.port || u.search || u.hash) return null;
    const m = /^\/package\/((?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+)\/?$/.exec(u.pathname);
    return m?.[1] ?? null;
  } catch { return null; }
};
export function noahProjectSources(entry: DirectoryEntry): string[] {
  // sources such as awesome/Reddit/HN describe discovery, not the Agent's distribution.
  return [...new Set([entry.card.href, ...(entry.card.sources ?? []).filter(s => ['github', 'huggingface', 'npm', 'docker', 'mcp-registry'].includes(s.source)).map(s => s.sourceUrl)].filter((s): s is string => typeof s === 'string'))];
}
export async function resolveNoahProvider(entry: DirectoryEntry, fetcher: typeof fetch = fetch): Promise<NoahProviderTarget> {
  const reviewed = await noahRevenueTarget(entry);
  if (reviewed) return reviewed;
  const sources = noahProjectSources(entry), signal = AbortSignal.timeout(20000);
  async function text(url: string) {
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { Accept: 'application/json, text/plain', 'User-Agent': 'Noah/1' } });
    if (response.status === 404) { await response.body?.cancel(); return null; }
    return new TextDecoder('utf-8', { fatal: true }).decode(await providerBytes(response, 262144));
  }
  async function json(url: string) {
    const body = await text(url); if (body === null) return null;
    try { return JSON.parse(body) as unknown; } catch { throw new NoahProviderInformationError('読み取れる接続定義', '提供元の接続定義を読み取れませんでした。正しいJSON形式の接続定義が必要です。'); }
  }
  async function manifest(value: unknown, provenance: string, repository: string): Promise<NoahProviderTarget | null> {
    if (!object(value) || typeof value.name !== 'string' || !Array.isArray(value.remotes)) return null;
    let needsAuth = false;
    for (const remote of value.remotes.slice(0, 8)) {
      if (!object(remote) || remote.type !== 'streamable-http') continue;
      const draft = await draftFromRegistry({ name: value.name, remotes: [remote] } as RegistryServer);
      if (!draft.ok || draft.connect.mouth !== 'mcp-remote') continue;
      if (draft.connect.secrets.length || ('headers' in draft.connect.target && draft.connect.target.headers?.length)) { needsAuth = true; continue; }
      if ('url' in draft.connect.target) return { kind: 'mcp', url: draft.connect.target.url, repository, provenance };
    }
    if (needsAuth) throw new NoahProviderInformationError('提供元の認証情報・接続条件', '提供元の認証情報または追加の接続条件が必要です。認証を省略して実行することはできません。');
    return null;
  }
  // Search all first-party sources before considering a CLI-only fallback.
  for (const source of sources) {
    try {
      const r = noahSourceRepository(source);
      if (r.provider === 'huggingface' && r.kind === 'spaces') return { kind: 'space', repository: `${r.owner}/${r.repo}` };
    } catch { /* Other supported distribution. */ }
  }
  for (const source of sources) {
    const name = packageName(source); if (!name) continue;
    const metadata = await json(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`);
    if (!object(metadata) || metadata.name !== name || typeof metadata.mcpName !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(metadata.mcpName)) continue;
    const url = `https://registry.modelcontextprotocol.io/v0.1/servers/${encodeURIComponent(metadata.mcpName)}/versions/latest`;
    const record = await json(url), server = object(record) ? record.server : null;
    if (!object(server) || server.name !== metadata.mcpName || !Array.isArray(server.packages) || !server.packages.some(p => object(p) && p.registryType === 'npm' && p.identifier === name && p.version === metadata.version)) continue;
    const official = object(record) && object(record._meta) ? record._meta['io.modelcontextprotocol.registry/official'] : null;
    if (!object(official) || official.status !== 'active') continue;
    const target = await manifest(server, url, source); if (target) return target;
  }
  const roots = sources.map(githubRoot).filter((r): r is NonNullable<typeof r> => !!r).slice(0, 2);
  for (const source of sources) {
    const match = /^https:\/\/hub\.docker\.com\/r\/mcp\/([a-z0-9][a-z0-9_-]{0,99})\/?$/.exec(source);
    if (!match) continue;
    const yaml = await text(`https://raw.githubusercontent.com/docker/mcp-registry/main/servers/${match[1]}/server.yaml`);
    // Accept only the small literal source block; do not interpret YAML tags, aliases or templates.
    const block = /^source:\r?\n((?: {2}[^\n]*\n?)*)/m.exec(yaml ?? '')?.[1] ?? '';
    const project = /^ {2}project: (https:\/\/github\.com\/[^\s]+)\r?$/m.exec(block)?.[1];
    const commit = /^ {2}commit: ([a-f0-9]{40})\r?$/m.exec(block)?.[1];
    const directory = /^ {2}directory: ([A-Za-z0-9_./-]+)\r?$/m.exec(block)?.[1] ?? '';
    const repo = github(project);
    if (!repo || !commit || directory.startsWith('/') || directory.split('/').some(p => p === '..' || p === '.')) continue;
    roots.push({ root: `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/${commit}${directory ? '/' + directory : ''}`, repository: source });
  }
  for (const { root, repository } of roots.slice(0, 3)) {
    for (const path of ['server.json', '.mcp/server.json']) {
      const url = `${root}/${path}`, target = await manifest(await json(url), url, repository);
      if (target) return target;
    }
    // Only the repository's own README can associate it with a hosted Space.
    const readme = await text(`${root}/README.md`);
    const spaces = [...new Set(readme?.match(/https:\/\/huggingface\.co\/spaces\/[A-Za-z0-9][\w.-]*\/[A-Za-z0-9][\w.-]*/g) ?? [])];
    if (spaces.length === 1) {
      const r = noahSourceRepository(spaces[0]);
      return { kind: 'space', repository: `${r.owner}/${r.repo}` };
    }
  }
  throw missing();
}
