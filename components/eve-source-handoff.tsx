'use client';
import { useEffect,useRef,useState } from 'react';
import { HOME_INTENT_MAX_AGE_MS, takeHomeIntentRecord, type HomeIntent } from '@/lib/home-intent';
import { checkEveSourceSelection, type EveSourceSelection } from '@/lib/eve-source-client';

export function useEveSourceContext(enabled:boolean,threadKey:string) {
  const [handoff,setHandoff]=useState<HomeIntent|null>(null);
  const [visibleKey,setVisibleKey]=useState<string|null>(null);
  const [selection,setSelection]=useState<EveSourceSelection|null>(null);
  const selectionRef=useRef<EveSourceSelection|null>(null);
  const selectedAt=useRef(0),lastObserved=useRef(0),invalid=useRef(false),generation=useRef(0);
  const lifecycle=useRef<AbortController|null>(null),operation=useRef<AbortController|null>(null);
  const [error,setError]=useState('');
  const [checking,setChecking]=useState(false);
  // Route identity is remembered in render state so A -> B -> A cannot revive
  // an already consumed handoff before the scheduled reset frame runs.
  const [observedRoute,setObservedRoute]=useState({key:threadKey,enabled});
  if(observedRoute.key!==threadKey || observedRoute.enabled!==enabled) {
    setObservedRoute({key:threadKey,enabled});
    setVisibleKey(null);setHandoff(null);setSelection(null);setError('');setChecking(false);
  }

  function checkTime(at:number) {
    const now=Date.now();
    if(now<at || now<lastObserved.current || now-at>HOME_INTENT_MAX_AGE_MS) {
      invalid.current=true;
      throw new Error('出典の確認期限が切れたか時計が変わりました。Skyから選び直してください。');
    }
    lastObserved.current=now;
  }
  useEffect(()=>{
    const run=++generation.current;selectionRef.current=null;operation.current?.abort();
    const controller=new AbortController();lifecycle.current=controller;
    const frame=requestAnimationFrame(()=>{
      setVisibleKey(threadKey);setSelection(null);setHandoff(null);setError('');setChecking(false);
      if(!enabled)return;
      let intent:HomeIntent|null;
      try {intent=takeHomeIntentRecord(sessionStorage);} catch {setError('引継ぎの保存領域を確認してください。');return;}
      if(!intent)return;
      if(!intent.context){setHandoff(intent);return;}
      setChecking(true);
      void checkEveSourceSelection(intent.context,fetch,controller.signal).then(()=>{
        if(!controller.signal.aborted && run===generation.current && Date.now()>=intent.at && Date.now()-intent.at<=HOME_INTENT_MAX_AGE_MS)setHandoff(intent);
      }).catch(reason=>{if(!controller.signal.aborted && run===generation.current)setError(reason instanceof Error?reason.message:'出典を確認できません。');})
        .finally(()=>{if(!controller.signal.aborted && run===generation.current)setChecking(false);});
    });
    return ()=>{selectionRef.current=null;cancelAnimationFrame(frame);controller.abort();};
  },[enabled,threadKey]);
  useEffect(()=>{
    if(typeof window==='undefined' || typeof window.addEventListener!=='function')return;
    const changed=()=>{
      const source=selectionRef.current?.source ?? handoff?.context?.source;
      if(source?.schema!=='rockstaros.eve-post-source/1')return;
      ++generation.current;invalid.current=true;operation.current?.abort();
      setHandoff(null);setChecking(false);setError('投稿の閲覧条件が変わりました。Skyから選び直してください。');
    };
    window.addEventListener('rockstar-community-changed',changed);window.addEventListener('storage',changed);
    return ()=>{window.removeEventListener('rockstar-community-changed',changed);window.removeEventListener('storage',changed);};
  },[handoff]);
  async function apply(onDraft:(text:string)=>void) {
    if(!enabled || visibleKey!==threadKey || !handoff || checking || !lifecycle.current || lifecycle.current.signal.aborted)return;
    const intent=handoff,run=++generation.current,controller=new AbortController();
    operation.current?.abort();operation.current=controller;
    const signal=AbortSignal.any([controller.signal,lifecycle.current.signal]);
    lastObserved.current=0;invalid.current=false;
    setChecking(true);setError('');
    try {
      checkTime(intent.at);
      const current=intent.context?await checkEveSourceSelection(intent.context,fetch,signal):null;
      if(signal.aborted || run!==generation.current)throw new Error('出典の確認を取り消しました。');
      checkTime(intent.at);
      selectionRef.current=current;selectedAt.current=intent.at;setSelection(current);
      onDraft(intent.text);setHandoff(null);
    } catch(reason){if(!signal.aborted && run===generation.current)setError(reason instanceof Error?reason.message:'出典を確認できません。');}
    finally{if(!signal.aborted && run===generation.current)setChecking(false);}
  }
  async function validate(expected?:EveSourceSelection,requestSignal?:AbortSignal) {
    if(!enabled || visibleKey!==threadKey) {
      if(expected)throw new Error('出典の画面が変わりました。Skyから選び直してください。');
      return undefined;
    }
    const pinned=selectionRef.current,run=generation.current,life=lifecycle.current;
    if(!pinned && !expected)return undefined;
    try {
      if(!pinned || expected && expected!==pinned || !life || life.signal.aborted || invalid.current)throw new Error('出典の選択が変わったか失効しました。Skyから選び直してください。');
      const signal=requestSignal?AbortSignal.any([requestSignal,life.signal]):life.signal;
      checkTime(selectedAt.current);
      await checkEveSourceSelection(pinned,fetch,signal);
      if(signal.aborted || run!==generation.current || selectionRef.current!==pinned)throw new Error('出典の選択が変わりました。');
      checkTime(selectedAt.current);
      return pinned;
    } catch(reason){
      if(run===generation.current && life && !life.signal.aborted){invalid.current=true;setError(reason instanceof Error?reason.message:'出典を確認できません。');}
      throw reason;
    }
  }
  function clear(){++generation.current;operation.current?.abort();selectionRef.current=null;setSelection(null);setHandoff(null);setError('');setChecking(false);}
  const visible=enabled && observedRoute.key===threadKey && observedRoute.enabled===enabled && visibleKey===threadKey;
  return {handoff:visible?handoff:null,selection:visible?selection:null,error:visible?error:'',checking:visible?checking:false,apply,validate,clear};
}
export function EveSourceHandoff({context,onDraft}:{context:ReturnType<typeof useEveSourceContext>;onDraft:(text:string)=>void}) {
  if(!context.handoff && !context.selection && !context.error && !context.checking)return null;
  return <section aria-label="SkyからEveへの引継ぎ">
    {context.checking && <output>選んだ出典を確認しています…</output>}
    {context.handoff && <><p>Skyで選んだ依頼です。入力へ読み込み、編集してから送信してください。既存の未送信入力は読み込み時に置き換わります。</p><pre>{context.handoff.text}</pre><button type="button" disabled={context.checking} onClick={()=>void context.apply(onDraft)}>依頼を入力欄へ読み込む</button></>}
    {context.selection && <p>{context.selection.plugin ? `選択した出典: ${context.selection.plugin.resource} · 配布元の版: ${context.selection.plugin.metadata.revision ?? '未確認'}。保存した情報との一致を送信前に再確認します。` : `選択した投稿: ${context.selection.post?.id}。投稿本文・添付・閲覧権限を送信前に再確認します。`}</p>}
    {context.error && <p role="alert">{context.error}</p>}
    <button type="button" onClick={context.clear}>出典の引継ぎを取り消す</button>
  </section>;
}
