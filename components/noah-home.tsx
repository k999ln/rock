import NoahTimeline from './noah-timeline';
import NoahPinHome from './noah-pin-home';
import type { NoahSurfaceMode } from '@/lib/noah-surface';
// ホームは、ピンタレスト風のグリッド（task 115。2026-11-22 の本人の決定）。今動かせる Agent の一覧がまだ公開されていない間は、今のタイムラインを出す。
export default function NoahHome({ mode = 'local', base = '/noah' }: { mode?: NoahSurfaceMode; base?: string }) {
  return <NoahPinHome fallback={<div style={{ maxWidth: 640, margin: '0 auto' }}><NoahTimeline mode={mode} base={base} /></div>} />;
}
