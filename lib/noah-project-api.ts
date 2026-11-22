import type { DirectoryEntry } from './noah-agent-directory.ts';
import type { NoahProjectDetail } from './noah-project-view.ts';
import { noahSourceRepository } from './noah-source-import.ts';
import { noahCloudProfile, type NoahCloudProfile } from './noah-cloud-contract.ts';
import { noahProjectSources } from './noah-provider-resolve.ts';

type Dependencies = { directory: () => Promise<DirectoryEntry[]>; fetcher?: typeof fetch; cloudEnabled?: boolean; cloudProfiles?: readonly NoahCloudProfile[] };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' } });
/** Resolve only an existing public catalog identity. The caller cannot supply a fetch URL or execution target. */
export function noahProjectDetail(entry: DirectoryEntry, cloudEnabled = false, cloudProfiles?: readonly NoahCloudProfile[]): NoahProjectDetail {
  const { card } = entry;
  if (cloudEnabled) for (const source of noahProjectSources(entry)) {
    if (typeof source !== 'string') continue;
    const profile = noahCloudProfile(source);
    if (profile && (!cloudProfiles || cloudProfiles.includes(profile))) return { card, connection: { kind: 'cloud', profile, providerFamilyId: entry.families.includes(card.id) ? card.id : null } };
  }
  if (entry.families.includes(card.id)) return { card, connection: { kind: 'ready', familyId: card.id } };
  // A source URL is provenance; social post URLs are never execution targets.
  let importHref: string | null = null;
  for (const value of noahProjectSources(entry)) {
    try {
      const repo = noahSourceRepository(value);
      if (repo.provider === 'huggingface' && repo.kind === 'spaces') return { card, connection: { kind: 'space', repository: `${repo.owner}/${repo.repo}` } };
      importHref ??= `/noah/agents/new?${new URLSearchParams({ sourceUrl: repo.url, name: card.name })}`;
    } catch { /* Not a supported source repository. */ }
  }
  return { card, connection: { kind: 'setup', importHref } };
}

/** Use the detail page's exact distribution and runtime checks for the connectable list too. */
export function withNoahCloudAvailability(entries: DirectoryEntry[], cloudEnabled = false, cloudProfiles?: readonly NoahCloudProfile[]): DirectoryEntry[] {
  return entries.map(entry => {
    const available = noahProjectDetail(entry, cloudEnabled, cloudProfiles).connection.kind === 'cloud';
    return { ...entry, cloudAvailable: available, card: available ? { ...entry.card, run: 'phone' } : entry.card };
  });
}

async function spaceHost(repository: string, fetcher: typeof fetch, origin: string) {
  const response = await fetcher(`https://huggingface.co/api/spaces/${repository.split('/').map(encodeURIComponent).join('/')}`, {
    redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' },
  });
  if (!response.ok || !response.body) { await response.body?.cancel(); throw Error('space_unavailable'); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength; if (length > 262144) throw Error('space_too_large'); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const info = JSON.parse(new TextDecoder().decode(bytes));
  if (info.id?.toLowerCase() !== repository.toLowerCase() || info.private !== false || info.gated || info.disabled || typeof info.host !== 'string') throw Error('space_unavailable');
  const host = new URL(info.host);
  if (host.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.hf\.space$/.test(host.hostname) || host.username || host.password || host.port || host.pathname !== '/' || host.search || host.hash) throw Error('space_unavailable');
  if (!['RUNNING', 'SLEEPING'].includes(info.runtime?.stage)) throw Error('space_unavailable');
  const page = await fetcher(host.href, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { Accept: 'text/html' } });
  await page.body?.cancel();
  if (!page.ok) throw Error('space_unavailable');
  if (!/^text\/html(?:;|$)/i.test(page.headers.get('content-type') ?? '')) throw Error('space_api_only');
  if (/deny|sameorigin/i.test(page.headers.get('x-frame-options') ?? '')) throw Error('space_embedding_denied');
  const ancestors = /(?:^|;)\s*frame-ancestors\s+([^;]+)/i.exec(page.headers.get('content-security-policy') ?? '')?.[1].split(/\s+/);
  if (ancestors && !ancestors.some(value => value === '*' || value === origin || value === 'https:')) throw Error('space_embedding_denied');
  return host.href;
}

export function createNoahProjectApi(deps: Dependencies) {
  return async (request: Request) => {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    const params = new URL(request.url).searchParams, id = params.get('id') ?? '', open = params.get('open');
    if (!/^project-[a-f0-9]{64}$/.test(id) || (open !== null && open !== 'space')) return json({ error: 'Agentの指定を確認してください。' }, 400);
    try {
      const entry = (await deps.directory()).find(row => row.card.feedbackId === id || row.card.id === id);
      if (!entry) return json({ error: 'このAgentは現在掲載されていません。' }, 404);
      const detail = noahProjectDetail(entry, deps.cloudEnabled, deps.cloudProfiles);
      if (open === 'space') {
        if (detail.connection.kind !== 'space') return json({ error: 'このAgentの接続先は変更されています。詳細を読み直してください。' }, 409);
        try { return json({ url: await spaceHost(detail.connection.repository, deps.fetcher ?? fetch, new URL(request.url).origin) }); }
        catch (error) { return json({ error: error instanceof Error && error.message === 'space_api_only'
          ? 'このSpaceはAPI専用です。Noahから実行するには接続設定が必要です。'
          : error instanceof Error && error.message === 'space_embedding_denied' ? 'このSpaceは画面の組み込みを許可していません。Noahの接続設定で別の実行方式を確認してください。'
          : '利用画面を確認できませんでした。提供元の停止・起動中・認証が必要な場合があります。時間をおいて再確認してください。' }, 503); }
      }
      return json(detail);
    } catch { return json({ error: 'Agentを読み込めませんでした。再試行してください。' }, 503); }
  };
}
