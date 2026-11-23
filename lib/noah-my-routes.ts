import { noahPageTab, type NoahPageParams } from './noah-page-routes.ts';

export const myViews = ['agents', 'activity', 'saved'] as const;
export const savedViews = ['results', 'boards', 'roles', 'files'] as const;
export type NoahMyView = (typeof myViews)[number];
export type NoahMySavedView = (typeof savedViews)[number];

export function noahMySelection(
  params: NoahPageParams,
  legacy?: 'activity' | 'saved',
) {
  const view = legacy ?? noahPageTab(params.view, myViews, 'agents');
  const saved = noahPageTab(
    params.tab,
    savedViews,
    legacy === 'saved' ? 'boards' : 'results',
  );
  return {
    view:
      view === 'saved' && params.tab === 'agents' ? ('agents' as const) : view,
    saved,
  };
}
export function noahMyHref(
  view: NoahMyView,
  saved: NoahMySavedView = 'results',
  params: NoahPageParams = {},
) {
  if (view === 'agents') return '/noah/my';
  const query = new URLSearchParams({ view });
  if (view === 'saved') {
    query.set('tab', saved);
    const key = saved === 'files' ? 'job' : saved === 'boards' ? 'board' : null;
    const value = key ? params[key] : null;
    if (key && typeof value === 'string' && value.trim())
      query.set(key, value.trim().slice(0, 160));
  }
  return '/noah/my?' + query;
}
