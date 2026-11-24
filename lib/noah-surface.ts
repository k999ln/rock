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
  if (hash === '#sky') return `${base}/explore?tab=tools`;
  if (['#catalog', '#optional-features'].includes(hash)) return `${base}/explore?tab=catalog`;
  if (hash === '#sky-manage') return mode === 'public' ? `${base}/saved?tab=roles` : noahActionHref(mode, base, 'library');
  return null;
}

/** These are navigation destinations, never authentication or execution grants. */
export function noahActionHref(mode: NoahSurfaceMode, base: string, target: string, agentId = '') {
  if (target === 'register') return '/noah/agents/new';
  if (target === 'library') return `${base}/my?view=agents`;
  if (target === 'work') return `${base}/activity`;
  if (target === 'agent' && /^[a-zA-Z0-9_-]{1,160}$/.test(agentId)) return `${base}/agents/${agentId}`;
  return `${base}/explore`;
}

export function noahMacPath(target: string, agentId = '') {
  if (target === 'agent' && /^[a-zA-Z0-9_-]{1,160}$/.test(agentId)) return `/noah/agents/${agentId}`;
  const paths: Record<string, string> = {
    library: '/noah/library', register: '/noah/agents/new', work: '/noah/work',
    marketplace: '/noah/marketplace', models: '/noah/models',
  };
  return Object.hasOwn(paths, target) ? paths[target] : '/noah/library';
}

/**
 * Mac だけで動く画面（このMacの接続を使う物。今は「ココナラの仕事」）を、メニューに出してよい端末か。
 * スマホ・タブレットの人は、開いても先へ進めない。iPad は Mac と名乗るが、触れる画面なので除く。
 * 画面そのものは消さない（URL で開けば今までどおり使える）。決め: 2026-11-23（本人「好きにしていいよ」）。
 */
export function noahMacMenuAllowed(platform: string, maxTouchPoints: number): boolean {
  return /^mac/i.test(platform.trim()) && maxTouchPoints <= 1;
}
