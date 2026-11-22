'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { NoahDraftStorage } from '@/lib/noah-draft-storage';
import { OWNER_SCOPE_HEADER } from '@/lib/owner-intent';
const size = (bytes:number) => bytes<1024 ? `${bytes} B` : bytes<1048576 ? `${(bytes/1024).toFixed(1)} KiB` : `${(bytes/1048576).toFixed(1)} MiB`;
export default function NoahDraftStoragePanel({scope,refresh,disabled,onRestored}:{scope:string;refresh:number;disabled:boolean;onRestored:(id:string)=>void}) {
  const [reload,setReload]=useState(0);
  const [storage,setStorage]=useState<NoahDraftStorage|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[message,setMessage]=useState('');
  const guard=useRef({busy:false,generation:0});
  useEffect(()=>{
    const controller=new AbortController();const current=guard.current;current.generation++;
    void fetch('/api/noah/drafts/storage',{cache:'no-store',signal:controller.signal}).then(async r=>{
      const data=await r.json() as {storage?:NoahDraftStorage;ownerScope?:string;error?:string};
      if(!r.ok||data.ownerScope!==scope||!data.storage)throw new Error(data.error||'下書きの保存量を確認できません。');
      if(!controller.signal.aborted){setStorage(data.storage);setError('');setPending(false);}
    }).catch(e=>{if(!controller.signal.aborted){setError(e.message);setStorage(null);setPending(false);}});
    return ()=>{controller.abort();current.generation++;};
  },[scope,refresh,reload]);
  async function act(kind:'maintain'|'more'|'restore',draft?:NoahDraftStorage['trash'][number]) {
    if(disabled||guard.current.busy||!scope||!storage)return;
    guard.current.busy=true;setPending(true);setError('');setMessage('');const generation=guard.current.generation;
    try {
      const path=kind==='restore'?`/api/noah/drafts/${draft!.id}/restore`:`/api/noah/drafts/storage${kind==='more'?`?trashAfter=${encodeURIComponent(storage.nextTrash!)}`:''}`;
      const r=await fetch(path,{method:kind==='more'?'GET':'POST',cache:'no-store',signal:AbortSignal.timeout(20000),...(kind==='more'?{}:{headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:scope},body:JSON.stringify(kind==='restore'?{revision:draft!.revision}:{})})});
      const data=await r.json() as {ownerScope?:string;storage?:NoahDraftStorage;draft?:{id:string};error?:string};
      if(guard.current.generation!==generation)return;
      if(!r.ok||data.ownerScope!==scope)throw new Error(data.error||'保存管理を完了できません。');
      if(kind==='restore'){
        if(data.draft?.id!==draft!.id)throw new Error('復元結果を確認できません。');
        setMessage('下書きを復元しました。現在の入力を保存して開きます。');onRestored(draft!.id);
      } else {
        if(!data.storage)throw new Error('保存量を確認できません。');
        setStorage({...data.storage,trash:kind==='more'?[...storage.trash,...data.storage.trash.filter(d=>!storage.trash.some(old=>old.id===d.id))]:data.storage.trash});
        if(kind==='maintain')setMessage(data.storage.scanPending?'保存領域の確認を続けられます。もう一度押すと次の範囲を確認します。':'保存領域を確認しました。猶予期間が終わった未参照ファイルを回収しました。');
      }
    } catch(e){if(guard.current.generation===generation)setError(e instanceof Error?e.message:'保存管理を完了できません。');}
    finally{guard.current.busy=false;if(guard.current.generation===generation)setPending(false);}
  }
  return <section aria-label="下書きの保存管理"><details><summary>下書きの保存量{storage?` ${size(storage.allocatedBytes)} / ${size(storage.limitBytes)}`:'を確認'}</summary>
    {!storage&&<button type="button" disabled={disabled||pending} onClick={()=>setReload(n=>n+1)}>保存量を読み直す</button>}
    {storage&&<>
      <p>入力 {size(storage.inputBytes)}・添付 {size(storage.objectBytes)}。保存中の予約 {size(storage.reservedBytes)}、未参照の回収待ち {size(storage.pendingBytes)}を含みます。下書き {storage.activeDrafts}/{storage.limitDrafts}件、管理対象ファイル {storage.objects}/{storage.limitObjects}件。</p>
      <p>登録Agentの原本・成果・モデルは対象外です。整理した下書きは7日間復元でき、その後は本文を整理します。参照のなくなった添付は24時間後から回収します。</p>
      <p>{storage.lastScanAt?`保存領域の前回確認：${new Date(storage.lastScanAt).toLocaleString('ja-JP')}`:'旧ファイルの確認はまだ完了していません。表示は管理対象として記録済みの量です。'}{storage.scanPending&&storage.lastScanAt?'（続きの確認があります）':''}</p>
      <button type="button" disabled={disabled||pending} onClick={()=>void act('maintain')}>保存量を再確認・不要ファイルを回収</button>
      {!!storage.trash.length&&<><h3>整理した下書きを復元</h3>{storage.trash.map(d=><p key={d.id}>{d.name} · {new Date(d.restoreUntil).toLocaleString('ja-JP')}まで <button type="button" disabled={disabled||pending} onClick={()=>void act('restore',d)}>この下書きを復元</button>{d.registeredUploadId&&<> · <Link href={`/noah/agents/${d.registeredUploadId}`}>登録したAgent</Link></>}</p>)}{storage.nextTrash&&<button type="button" disabled={disabled||pending} onClick={()=>void act('more')}>整理した下書きの続きを表示</button>}</>}
    </>}{error&&<p role="alert">{error}</p>}{message&&<output>{message}</output>}
  </details></section>;
}
