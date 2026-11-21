/** Canonical page destinations. Query strings are allowlisted, never return URLs. */
export type NoahPageParams = Record<string, string | string[] | undefined>;
export const NOAH_EXPLORE_TABS = ['ready', 'catalog', 'tools'] as const;
export const NOAH_SAVED_TABS = ['boards', 'agents', 'roles', 'results', 'files'] as const;
export function noahPageTab<T extends string>(value: unknown, tabs: readonly T[], fallback: T): T {
  return typeof value === 'string' && tabs.includes(value as T) ? value as T : fallback;
}
export function noahPageHref(page: 'explore' | 'saved', params: NoahPageParams = {}, tab?: string) {
  const query = new URLSearchParams();
  const keys = page === 'explore' ? ['q', 'via'] : ['board', 'job'];
  if (tab) query.set('tab', noahPageTab(tab, page === 'explore' ? NOAH_EXPLORE_TABS : NOAH_SAVED_TABS, page === 'explore' ? 'ready' : 'boards'));
  for (const key of keys) {
    const value = params[key];
    if (typeof value === 'string' && value.trim()) query.set(key, value.trim().slice(0, key === 'q' ? 200 : 160));
  }
  return `/noah/${page}${query.size ? `?${query}` : ''}`;
}
