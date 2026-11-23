'use client';
import { useNoahSurface } from './noah-surface-context';
import NoahTimeline from './noah-timeline';
import NoahPinHome from './noah-pin-home';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
// The store and saved hash links share the same Agent and Work routes.
export default function NoahHome({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) {
  const surface=useNoahSurface();
  if(['#timeline','#following','#agents'].includes(surface?.hash??''))return <NoahTimeline mode={mode} base={base}/>;
  return <NoahPinHome showFirstJobs={mode === 'public'} fallback={<div style={{ maxWidth: 640, margin: '0 auto' }}><NoahTimeline mode={mode} base={base} /></div>} />;
}
