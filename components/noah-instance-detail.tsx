'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
import { startNoahVisiblePolling } from '@/lib/noah-visible-polling';
import type { NoahAgentPin } from '@/lib/noah-instances';
import WorkspaceShell from './workspace-shell';
import NoahManagedInstallation from './noah-managed-installation';
import { InstanceResponseError, instanceResponse, type InstanceView } from './noah-instances';
import styles from './noah-agent-catalog.module.css';

export default function NoahInstanceDetail({id}:{id:string}) {
  const [record,setRecord]=useState<InstanceView|null>(null),[scope,setScope]=useState(''),[pins,setPins]=useState<NoahAgentPin[]>([]);
  const [selected,setSelected]=useState(''),[confirmed,setConfirmed]=useState(false),[removeConfirmed,setRemoveConfirmed]=useState(false),[error,setError]=useState(''),[readError,setReadError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0);
  const sending=useRef(false),intent=useRef<{id:string;revision:number;commandId:string;agentId:string;digest:string;replacePending:boolean}|null>(null);
  useEffect(()=>startNoahVisiblePolling(async signal=>{
    try {
      const data=await instanceResponse(await fetch(`/__noah/instances?id=${encodeURIComponent(id)}`,{cache:'no-store',signal}));
      if(!data.instance||!data.ownerScope) throw new Error('利用先とアカウントを確認できません。');
      const instance=data.instance;
      let candidates:NoahAgentPin[]=[];
      const base=instance.active||instance.pending?.pin||instance.last?.pin;
      if(base) {
        try {const versions=await instanceResponse(await fetch(`/__noah/instances?agentId=${encodeURIComponent(base.agentId)}`,{cache:'no-store',signal}));if(versions.ownerScope===data.ownerScope)candidates=versions.pins||[];}
        catch {/* Retained pins can still be selected; preparation rechecks current rights. */}
      }
      if(!signal.aborted&&!sending.current) {
        setRecord(instance);setScope(data.ownerScope);setReadError('');
        setPins([...candidates,...instance.history,...(instance.active?[instance.active]:[]),...(instance.last?[instance.last.pin]:[])].filter((p,i,a)=>a.findIndex(x=>x.digest===p.digest)===i));
      }
      return instance.pending?1500:15000;
    } catch(e){if(!signal.aborted){setReadError(e instanceof Error?e.message:'読み込めません。');setScope('');}}
  },15000),[id,tick]);
  const chosen=pins.find(p=>p.digest===selected);
  async function act(action:'prepare'|'cancel'|'remove') {
    if(sending.current||!record||!scope||readError||action==='prepare'&&(!chosen||!confirmed)||action==='remove'&&!removeConfirmed)return;
    sending.current=true;setBusy(true);setError('');
    try {
      let body:unknown;
      if(action==='prepare') {
        intent.current??={id,revision:record.revision,commandId:crypto.randomUUID(),agentId:chosen!.agentId,digest:chosen!.digest,replacePending:Boolean(record.pending)};
        body=intent.current;
      } else body={action,id,revision:record.revision};
      const data=await instanceResponse(await fetch(action==='remove'?'/api/noah/instances':'/__noah/instances',{method:'POST',headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(body)}));
      if(data.ownerScope!==scope||!data.instance)throw new Error('アカウントが変わりました。');setRecord(data.instance);intent.current=null;setConfirmed(false);setRemoveConfirmed(false);
    } catch(e){if(e instanceof InstanceResponseError&&e.status===409){intent.current=null;setConfirmed(false);}setError(e instanceof Error?e.message:'操作できません。');}
    finally{sending.current=false;setBusy(false);setTick(n=>n+1);}
  }
  return <WorkspaceShell title="Noah" tone="sky"><main className={styles.page}>
    <nav className={styles.nav}><Link href="/noah/saved?tab=agents">← 自分のAgent</Link><Link href="/noah/work">すべての版の仕事・成果</Link><Link href="/noah/agents/new">新しい版を登録</Link></nav>
    <h1>{record?.active?.name||record?.pending?.pin.name||record?.last?.pin.name||'Agentの版管理'}</h1>
    {readError&&<p role="alert" className={styles.error}>{readError}</p>}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    {record&&<>
      <section className={styles.notice} aria-label="使用版と更新"><h2>使用する版：{record.active?.version||'未選択'}</h2>
        <p>{record.removed?'ライブラリから外しています。版を準備すると再追加できます。':'選択した版の準備ができてから切り替えます。実行中の仕事と保存済みの運用条件は元の版を使い続けます。'}</p>
        {record.pending&&<output>{record.preparationAttached?'候補版を裏側で準備しています。画面を閉じても続きます。':'前回の準備が中断しています。候補版を選んで再試行するか、切替を取り消してください。'} <button disabled={busy||!scope} onClick={()=>void act('cancel')}>版の切替を取り消す</button></output>}
        {record.last?.state==='failed'&&<p role="alert">{record.last.error}</p>}
        <label>使いたい版<select aria-label="使いたい版" value={selected} onChange={e=>{setSelected(e.target.value);setConfirmed(false);intent.current=null;}}><option value="">版を選んでください</option>{pins.map(p=><option key={p.digest} value={p.digest}>{p.version} · {p.digest.slice(0,8)}{p.digest===record.active?.digest?'（使用版）':record.history.some(h=>h.digest===p.digest)?'（以前の版）':''}</option>)}</select></label>
        {chosen&&<><p>必要モデル：{chosen.model} ／ 権限：{chosen.permissions.join('、')}</p><p>{chosen.priceNote}</p><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>選択した版・モデル・権限を確認しました。</label></>}
        <div className={styles.actions}><button disabled={!chosen||!confirmed||busy||!scope} onClick={()=>void act('prepare')}>{record.pending?'この版の準備をやり直す':record.history.some(p=>p.digest===selected)?'この版に戻す':'この版を準備して使う'}</button></div>
        <p>失敗した場合は元の使用版を維持します。旧版も、現在の取得権・審査・利用権を再確認します。以前の版は直近20版まで表示します。</p>
      </section>
      {record.active&&!record.removed&&<NoahManagedInstallation key={record.active.digest} id={record.active.agentId} terminal={record.active.kind!=='catalog'} />}
      <section className={styles.notice}><h2>ライブラリから外す</h2><p>実行中の仕事と継続運用を停止・照合してから操作してください。登録したコード、成果、共有モデル、取得済み本体は残ります。本体の削除は元のAgent詳細で扱います。</p>
        {!record.removed&&<><label><input type="checkbox" checked={removeConfirmed} onChange={e=>setRemoveConfirmed(e.target.checked)}/>ライブラリの使用版を外します。</label><button disabled={!removeConfirmed||busy||!scope||Boolean(record.pending)} onClick={()=>void act('remove')}>ライブラリから外す</button></>}
      </section>
    </>}
  </main></WorkspaceShell>;
}
