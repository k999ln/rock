'use client';
import Link from 'next/link';
import NoahPublicCatalog from './noah-public-catalog';
import SkyWorkspace from './sky-workspace';
export default function NoahExplore({initialTab,initialQuery='',via=''}:{initialTab?:string;initialQuery?:string;via?:string}) {
  if(initialTab==='tools')return <><Link href="/noah">Agentを探す</Link><SkyWorkspace initialQuery={initialQuery}/></>;
  return <NoahPublicCatalog embedded initialQuery={initialQuery} initialSource="" via={via}/>;
}
