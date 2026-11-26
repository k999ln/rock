import NoahHome from '@/components/noah-home';
import SkyWorkspace from '@/components/sky-workspace';
import NoahTrialEntry from '@/components/noah-trial-entry';
import { noahShareMetadata } from '@/lib/noah-share-metadata';
import type { NoahPageParams } from '@/lib/noah-page-routes';
export const metadata = noahShareMetadata('/noah');
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}) {
  const p = await searchParams;
  return <><NoahTrialEntry via={typeof p.via === 'string' ? p.via : ''}/><NoahHome mode="public" tools={p.tab === 'tools' ? <SkyWorkspace initialQuery={typeof p.q === 'string' ? p.q.slice(0, 200) : ''}/> : undefined}/></>;
}
