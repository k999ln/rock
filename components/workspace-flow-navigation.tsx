'use client';
import Link from 'next/link';
import { eveWorkspaceNavigation } from '@/lib/eve-noah-navigation';
import { usePathname, useSearchParams } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { MessageCircle, ListChecks, Cable, Settings } from 'lucide-react';
function subscribe(changed:()=>void) {
  window.addEventListener('hashchange',changed);window.addEventListener('popstate',changed);
  return ()=>{window.removeEventListener('hashchange',changed);window.removeEventListener('popstate',changed);};
}
export default function WorkspaceFlowNavigation({running=false}:{running?:boolean}) {
  const path=usePathname();
  const toolNavigation=eveWorkspaceNavigation(useSearchParams().toString());
  const hashResults=useSyncExternalStore(subscribe,()=>window.location.hash==='#eve-work-results',()=>false);
  const results=hashResults||toolNavigation.workView;
  const eve=path==='/chat'||path==='/os/eve'||path.startsWith('/os/eve/');
  const items=[
    {label:'Eve',href:eve?toolNavigation.compose:'/os/eve',icon:MessageCircle,active:eve&&!results},
    {label:'仕事と成果',href:eve?toolNavigation.results:'/os/eve#eve-work-results',icon:ListChecks,active:eve&&results},
    {label:'接続',href:'/connect/service',icon:Cable,active:path.startsWith('/connect')||path==='/sky/network'||path==='/os/sky/network'},
    {label:'設定',href:'/settings',icon:Settings,active:path.startsWith('/settings')},
  ];
  return <nav className="os-flow-navigation" aria-label="仕事と利用環境">{items.map(item=><Link key={item.label} href={item.href} aria-current={item.active?'page':undefined} aria-disabled={running||undefined}><item.icon size={18}/><span>{item.label}</span></Link>)}</nav>;
}
