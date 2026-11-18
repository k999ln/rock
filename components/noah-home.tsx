import NoahTimeline from './noah-timeline';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
export default function NoahHome({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) { return <NoahTimeline mode={mode} base={base} />; }
