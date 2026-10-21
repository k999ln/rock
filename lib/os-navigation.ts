export type OsNavigationId = 'stream' | 'discover' | 'eve' | 'agents' | 'communities';

export const osNavigationItems = [
  { id: 'stream', href: '/#timeline', label: 'Skyのストリーム' },
  { id: 'discover', href: '/#catalog', label: '見つける' },
  { id: 'eve', href: '/chat', label: 'Eve' },
  { id: 'agents', href: '/sky/agents', label: '自分のSky' },
  { id: 'communities', href: '/#communities', label: 'コミュニティー' },
] as const;

/** avoado.si/ is the WebOS home; /os remains a compatible entrance. */
export function osRouteHref(pathname: string, href: string, local = false): string {
  if (local) return href;
  const inOs = pathname === '/' || pathname === '/chat' || pathname === '/os' || pathname.startsWith('/os/') || pathname === '/sky' || pathname.startsWith('/sky/');
  if (!inOs) return href;
  if (href === '/') return '/';
  if (href.startsWith('/#')) return href;
  if (href === '/chat') return '/os/eve';
  if (href.startsWith('/chat?')) return '/os/eve?mode=tools&' + href.slice(6);
  if (/^\/sky(?:\/|\?|$)/.test(href)) return '/os' + href;
  return href;
}

export function activeOsNavigation(pathname: string, hash = ''): OsNavigationId | null {
  const path = pathname.replace(/^\/os(?=\/|$)/, '') || '/';
  if (path === '/chat' || path === '/eve' || path.startsWith('/eve/')) return 'eve';
  if (path === '/sky/agents' || path.startsWith('/sky/agents/')) return 'agents';
  if (path === '/sky') return 'discover';
  if (path !== '/') return null;
  if (hash === '#catalog' || hash === '#optional-features') return 'discover';
  if (hash === '#communities' || hash.startsWith('#community=')) return 'communities';
  return 'stream';
}
