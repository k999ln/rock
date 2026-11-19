export type NoahSurfaceMode = 'local' | 'public';
export type NoahHomeView = 'news' | 'social' | 'communities';

/** Keep only registration state when navigating, never an arbitrary return URL. */
export function noahUploadPath(search = '', draftId?: string) {
  const current = new URLSearchParams(search), next = new URLSearchParams();
  if (current.get('launch') === '1') next.set('launch', '1');
  const draft = draftId ?? current.get('draft');
  if (draft && /^[a-f0-9-]{36}$/i.test(draft)) next.set('draft', draft);
  const query = next.toString();
  return `/noah/agents/new${query ? `?${query}` : ''}`;
}

export function noahHomeView(hash: string): NoahHomeView {
  if (hash === '#social' || hash === '#following') return 'social';
  if (hash === '#communities' || hash.startsWith('#community=')) return 'communities';
  return 'news';
}

export function noahLegacyHref(hash: string, mode: NoahSurfaceMode, base: string): string | null {
  if (hash === '#sky') return `${base}/tools`;
  if (['#catalog', '#optional-features'].includes(hash)) return `${base}/agents`;
  if (hash === '#sky-manage') return mode === 'public' ? `${base}/saved` : noahActionHref(mode, base, 'library');
  return null;
}

/** These are navigation destinations, never authentication or execution grants. */
export function noahActionHref(mode: NoahSurfaceMode, base: string, target: string, agentId = '') {
  const path = noahMacPath(target, agentId);
  if (mode === 'local') return path;
  if (target === 'register') return '/noah/agents/new?launch=1';
  if (target === 'library' || target === 'work') return `/noah/launch#${target}`;
  return `${base}/mac?${new URLSearchParams({ target, ...(agentId ? { agent: agentId } : {}) })}`;
}

export function noahMacPath(target: string, agentId = '') {
  if (target === 'agent' && /^[a-zA-Z0-9_-]{1,160}$/.test(agentId)) return `/noah/agents/${agentId}`;
  const paths: Record<string, string> = {
    library: '/noah/library', register: '/noah/agents/new', work: '/noah/work',
    marketplace: '/noah/marketplace', models: '/noah/models',
  };
  return Object.hasOwn(paths, target) ? paths[target] : '/noah/library';
}
