import { permanentRedirect } from 'next/navigation';
import { noahPageHref, NOAH_EXPLORE_TABS, noahPageTab, type NoahPageParams } from '@/lib/noah-page-routes';
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}) {
  const p = await searchParams;
  permanentRedirect(noahPageHref('explore', p, typeof p.tab === 'string' ? noahPageTab(p.tab, NOAH_EXPLORE_TABS, 'ready') : undefined));
}
