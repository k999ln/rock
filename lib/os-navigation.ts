export type OsNavigationId = 'stream' | 'eve' | 'communities';

export const osNavigationItems = [
  { id: 'stream', href: '/#timeline', label: 'Smith' },
  { id: 'eve', href: '/chat', label: 'Eve' },
  { id: 'communities', href: '/#communities', label: 'コミュニティー' },
] as const;

/** avoado.si/ is the WebOS home; /os remains a compatible entrance. */
export function osRouteHref(pathname: string, href: string, local = false): string {
  if (local) return href;
  const inOs = pathname === '/' || pathname === '/chat' || pathname === '/os' || pathname.startsWith('/os/') || pathname === '/sky' || pathname.startsWith('/sky/');
  if (!inOs) return href;
  if (href === '/') return '/';
  if (href === '/sky/agents') return '/#sky-manage';
  if (href.startsWith('/#')) return href;
  if (href === '/chat') return '/os/eve';
  if (href.startsWith('/chat?')) return '/os/eve?mode=tools&' + href.slice(6);
  if (/^\/sky(?:\/|\?|$)/.test(href)) return '/os' + href;
  return href;
}

export function activeOsNavigation(pathname: string, hash = ''): OsNavigationId | null {
  const path = pathname.replace(/^\/os(?=\/|$)/, '') || '/';
  if (path === '/chat' || path === '/eve' || path.startsWith('/eve/')) return 'eve';
  if (path === '/sky/agents' || path.startsWith('/sky/agents/')) return 'stream';
  if (path === '/sky') return 'stream';
  if (path !== '/') return null;
  if (hash === '#catalog' || hash === '#optional-features') return 'stream';
  if (hash === '#communities' || hash.startsWith('#community=')) return 'communities';
  return 'stream';
}

/** Old catalog links and saved agent URLs open one panel on Home. */
export function skyHomePanelForHash(hash: string): 'discover' | 'manage' | null {
  if (hash === '#sky-manage') return 'manage';
  if (['#sky', '#catalog', '#optional-features'].includes(hash)) return 'discover';
  return null;
}
