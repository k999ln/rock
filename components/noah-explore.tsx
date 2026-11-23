'use client';
import Link from 'next/link';
import NoahPublicCatalog from './noah-public-catalog';
import SkyWorkspace from './sky-workspace';
export default function NoahExplore({initialTab,initialQuery='',via=''}:{initialTab?:string;initialQuery?:string;via?:string}) {
  if(initialTab==='tools')return <><Link href="/noah/explore">Agentを探す</Link><SkyWorkspace initialQuery={initialQuery}/></>;
  return <><p><Link href="/noah/agents/verified">確認済み786系列と現在の稼働状態</Link></p><NoahPublicCatalog embedded initialQuery={initialQuery} initialSource={initialTab==='catalog'?'':'noah'} via={via}/></>;
}
