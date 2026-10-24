export type OsNavigationId = 'stream' | 'eve' | 'communities';

/** Existing main routes. Navigation never rewrites a saved Agent or work URL. */
export const osNavigationItems = [
  { id: 'stream', label: 'Smith', href: '/#timeline' },
  { id: 'eve', label: 'Eve', href: '/chat' },
  { id: 'communities', label: 'コミュニティー', href: '/#communities' },
] as const;

export function activeOsNavigation(pathname: string, hash = ''): OsNavigationId | null {
  const path = pathname.replace(/^\/os(?=\/|$)/, '') || '/';
  if (path === '/chat' || path.startsWith('/eve/')) return 'eve';
  if (path === '/sky' || path === '/sky/agents' || path.startsWith('/sky/agents/')) return 'stream';
  if (path !== '/') return null;
  return hash === '#communities' || hash.startsWith('#community=') ? 'communities' : 'stream';
}
