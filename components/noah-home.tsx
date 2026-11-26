'use client';
import { useSearchParams } from 'next/navigation';
import NoahTimeline from './noah-timeline';
import NoahPinHome from './noah-pin-home';
import type { ReactNode } from 'react';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
// Search and legacy timeline anchors use the same home, without replacing it.
export default function NoahHome({ mode = 'local', base = '/noah', tools }: { mode?: NoahSurfaceMode; base?: string; tools?: ReactNode }) {
  const params = useSearchParams();
  const query = (params.get('q') ?? params.get('collectionQuery') ?? '').slice(0, 200);
  const source = params.get('collectionSource') ?? (params.get('tab') === 'catalog' ? '' : 'noah');
  function clearQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('q'); url.searchParams.delete('collectionQuery');
    window.location.assign(url.pathname + url.search + '#noah-collection');
  }
  return <>
    <NoahPinHome key={source} searchQuery={query} initialSource={source} onClearQuery={clearQuery} showFirstJobs={mode === 'public' && !query}/>
    {tools}
    {!query && <section id="timeline" aria-label="タイムライン"><NoahTimeline mode={mode} base={base}/></section>}
  </>;
}
