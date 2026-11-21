'use client';
import { useState } from 'react';
import NoahReady from './noah-ready';
import NoahShelf from './noah-shelf';
import NoahPublicCatalog from './noah-public-catalog';
import SkyWorkspace from './sky-workspace';
import NoahPageTabs from './noah-page-tabs';
import { NOAH_EXPLORE_TABS, noahPageTab } from '@/lib/noah-page-routes';
export default function NoahExplore({initialTab,initialQuery='',via=''}:{initialTab?:string;initialQuery?:string;via?:string}) {
  const tab=noahPageTab(initialTab,NOAH_EXPLORE_TABS,'ready'),[query,setQuery]=useState(initialQuery);
  return <><NoahPageTabs page="explore" active={tab} params={{q:query,via}} items={[["ready","使えるAgent"],["catalog","カタログ"],["tools","Tool"]]}/>
    {tab==='ready'?<NoahReady initialQuery={initialQuery} onQueryChange={setQuery} shelf={<NoahShelf/>}/>:tab==='catalog'?<NoahPublicCatalog embedded initialQuery={initialQuery} onQueryChange={setQuery}/>:<SkyWorkspace initialQuery={initialQuery} onQueryChange={setQuery}/>}</>;
}
