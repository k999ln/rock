export type NoahSurfaceMode = 'local' | 'public';
export type NoahHomeView = 'news' | 'social' | 'communities';

export function noahHomeView(hash: string): NoahHomeView {
  if (hash === '#social' || hash === '#following') return 'social';
  if (hash === '#communities' || hash.startsWith('#community=')) return 'communities';
  return 'news';
}

export function noahLegacyHref(hash: string, mode: NoahSurfaceMode, base: string): string | null {
  if (['#sky', '#catalog', '#optional-features'].includes(hash)) return `${base}/agents`;
  if (hash === '#sky-manage') return noahActionHref(mode, base, 'library');
  return null;
}

/** These are navigation destinations, never authentication or execution grants. */
export function noahActionHref(mode: NoahSurfaceMode, base: string, target: string, agentId = '') {
  const path = noahMacPath(target, agentId);
  if (mode === 'local') return path;
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
