import NoahExplore from '@/components/noah-explore';
import NoahTrialEntry from '@/components/noah-trial-entry';
import { NOAH_EXPLORE_TABS, noahPageTab, type NoahPageParams } from '@/lib/noah-page-routes';
export const metadata={title:'Agentを探す — Noah'};
export default async function Page({searchParams}:{searchParams:Promise<NoahPageParams>}) {
 const p=await searchParams,tab=noahPageTab(p.tab,NOAH_EXPLORE_TABS,'ready'),q=typeof p.q==='string'?p.q.slice(0,200):'',via=typeof p.via==='string'?p.via:'';
 return <><NoahTrialEntry via={via}/><NoahExplore key={tab+'|'+q} initialTab={tab} initialQuery={q} via={via}/></>;
}
