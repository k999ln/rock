'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { NoahAgentPin, NoahInstance } from '@/lib/noah-instances';
import { NoahAgentPin as AgentPin, NoahAgentPinGrid } from './noah-agent-pin';
import styles from './noah-agent-catalog.module.css';

export type InstanceView = NoahInstance & { preparationAttached?: boolean };
export class InstanceResponseError extends Error {
  constructor(message:string, public status:number) { super(message); }
}
export async function instanceResponse(response:Response) {
  const data=await response.json().catch(()=>({error:'このMacのNoahへ接続してください。'})) as {instance?:InstanceView;instances?:InstanceView[];pins?:NoahAgentPin[];ownerScope?:string;error?:string};
  if(!response.ok) throw new InstanceResponseError(data.error||'ライブラリの版を確認できません。',response.status); return data;
}
export function NoahInstanceAdd({agentId,scope}:{agentId:string;scope:string}) {
  const [pin,setPin]=useState<NoahAgentPin|null>(null),[instance,setInstance]=useState<InstanceView|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0);
  const intent=useRef<{id:string;revision:number;commandId:string;agentId:string;digest:string;replacePending:boolean}|null>(null);
  const sending=useRef(false);
  useEffect(()=>{
    if(!scope) return;
    return startNoahVisiblePolling(async signal=>{
      try { const data=await instanceResponse(await fetch(`/__noah/instances?agentId=${encodeURIComponent(agentId)}`,{cache:'no-store',signal}));
        if(data.ownerScope!==scope) throw new Error('アカウントが変わりました。');
        if(!signal.aborted) {setPin(data.pins?.find(p=>p.agentId===agentId)||null);setInstance(data.instance||null);setError('');}
        return data.instance?.pending?1500:15000;
      } catch(e) {if(!signal.aborted) {setPin(null);setError(e instanceof Error?e.message:'読み込めません。');}}
    },15000);
  },[agentId,scope,tick]);
  async function add() {
    if(!pin||sending.current) return;
    sending.current=true;setBusy(true);setError('');
    intent.current??={id:instance?.id||crypto.randomUUID(),revision:instance?.revision||0,commandId:crypto.randomUUID(),agentId,digest:pin.digest,replacePending:false};
    try {const data=await instanceResponse(await fetch('/__noah/instances',{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(intent.current)}));
      if(data.ownerScope!==scope||!data.instance) throw new Error('保存先のアカウントを確認してください。');setInstance(data.instance);intent.current=null;
    } catch(e) {if(e instanceof InstanceResponseError&&e.status===409)intent.current=null;setError(e instanceof Error?e.message:'追加できません。');}
    finally {sending.current=false;setBusy(false);setTick(n=>n+1);}
  }
  return <section aria-label="Agentをライブラリで管理"><h3>使用する版を保存</h3>
    {instance?<><p>{instance.pending?'版の準備を確認しています。':instance.active?`使用する版：${instance.active.version}`:'使用する版はまだありません。'}{instance.removed?'（ライブラリから外しています）':''}</p><Link href={`/noah/library/${instance.id}`}>版の更新・復元・管理へ →</Link></>:
      <><p>この版をライブラリに追加すると、更新候補と元の版をまとめて管理できます。</p><button disabled={!pin||busy} onClick={()=>void add()}>この版を準備して追加</button></>}
    {error&&<p role="alert">{error}</p>}
  </section>;
}

export function NoahInstancesList() {
  const [rows,setRows]=useState<NoahInstance[]>([]),[error,setError]=useState('');
  useEffect(()=>startNoahVisiblePolling(async signal=>{
    try {const data=await instanceResponse(await fetch('/api/noah/instances',{cache:'no-store',signal}));if(!Array.isArray(data.instances))throw new Error('一覧を確認できません。');if(!signal.aborted){setRows(data.instances);setError('');}}
    catch(e){if(!signal.aborted){setRows([]);setError(e instanceof Error?e.message:'読み込めません。');}}
  },15000),[]);
  return <section className={styles.notice}><h2>使用するAgentと版</h2><p>詳細画面から追加したAgentの更新・元の版への復元を管理します。</p>
    {error&&<p role="alert">{error}</p>}
    {!rows.length&&!error&&<p>Agentの詳細で「この版を準備して追加」を選ぶと表示されます。</p>}
    <NoahAgentPinGrid>{rows.map(row => {
      const pin = row.active ?? row.pending?.pin ?? row.last?.pin;
      const status = row.removed ? 'ライブラリから削除済み' : row.pending ? '版を準備中' : row.last?.state === 'failed' ? '準備失敗・元の版を保持' : '保存済み';
      return <AgentPin key={row.id} id={pin?.agentId ?? row.id} name={pin?.name ?? '準備中のAgent'}
        href={`/noah/library/${row.id}`} meta={`${row.active?.version || '未選択'} · ${status}`} />;
    })}</NoahAgentPinGrid>
  </section>;
}
