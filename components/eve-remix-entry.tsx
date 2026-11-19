'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import EveRemixWorkspace from './eve-remix-workspace';
import WorkspaceShell from './workspace-shell';
export default function EveRemixEntry(){
 const [owner,setOwner]=useState('');
 useEffect(()=>{const controller=new AbortController();void fetch('/api/sky/agents',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json() as {ownerUserId?:string};if(r.ok&&d.ownerUserId)setOwner(d.ownerUserId);}).catch(()=>{});return()=>controller.abort();},[]);
 return <WorkspaceShell title="Eve · 掛け合わせる"><div style={{maxWidth:1480,margin:'0 auto',padding:20}}><Link href="/os/eve">← Eveへ</Link><h1>つくる、その続きへ。</h1><p>素材を重ねて、Eveと次の作品を。</p><EveRemixWorkspace key={owner} owner={owner}/></div></WorkspaceShell>;
}
