'use client';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import NoahPinHome from './noah-pin-home';
import type { ReactNode } from 'react';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
const MarketDetail = dynamic(() => import('./sky-marketplace'), { ssr: false });
// Search and legacy timeline anchors use the same home, without replacing it.
export default function NoahHome({ mode = 'local', tools }: { mode?: NoahSurfaceMode; base?: string; tools?: ReactNode }) {
  const params = useSearchParams();
  const router = useRouter();
  const packageKey = params.get('package')?.slice(0, 256), model = packageKey ? null : params.get('model')?.slice(0, 200);
  function closeMarketDetail() {
    const url = new URL(window.location.href); url.searchParams.delete('package'); url.searchParams.delete('model');
    router.replace(url.pathname + url.search, { scroll: false });
  }
  const query = (params.get('q') ?? params.get('collectionQuery') ?? '').slice(0, 200);
  const source = params.get('collectionSource') ?? '';
  function clearQuery() {
    const url = new URL(window.location.href);
    url.searchParams.delete('q'); url.searchParams.delete('collectionQuery');
    window.location.assign(url.pathname + url.search + '#noah-collection');
  }
  return <>
    <NoahPinHome key={source} searchQuery={query} initialSource={source} onClearQuery={clearQuery} showFirstJobs={mode === 'public' && !query}/>
    {(packageKey || model) && <MarketDetail key={`${packageKey ?? ''}:${model ?? ''}`} initialPackageKey={packageKey ?? null} initialModel={model ?? null} detailsOnly onClose={closeMarketDetail}/> }
    {tools}
  </>;
}
