'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { useNoahLocale } from './noah-locale';
import { NOAH_PIN_TOPIC_LABELS } from '@/lib/noah-pins';
import { NOAH_COLLECTION_LABELS, NOAH_COLLECTION_SOURCES } from '@/lib/noah-collection';
import NoahPinGrid, {type NoahPinView} from './noah-pin-grid';
import NoahLoading from './noah-loading';
import { useNoahAutoPage } from './use-noah-auto-page';
import { NoahStoreServices } from './noah-store-entry';
import styles from './noah-pins.module.css';
type Page={items:NoahPinView[];nextCursor:string|null;ownerScope:string|null;total:number;firstJobs?:NoahFirstJob[]};
export default function NoahPinHome({fallback,searchQuery='',initialSource='',onClearQuery,showFirstJobs=false}:{fallback?:ReactNode;searchQuery?:string;initialSource?:string;onClearQuery?:()=>void;showFirstJobs?:boolean}) {
  const params=useSearchParams();
  const {t}=useNoahLocale();
  const [source,setSource]=useState(params.get('collectionSource')??initialSource),[attempt,setAttempt]=useState(0);
  const [topic,setTopic]=useState(params.get('collectionTopic')??'');
  const [order,setOrder]=useState<'hot'|'new'>('hot');
  const [state,setState]=useState<{key:string;page?:Page;error?:string;more?:boolean;restart?:boolean}>();
  const key=new URLSearchParams({q:searchQuery,source,order,cursor:'0',...(topic?{topic}:{}),...(showFirstJobs?{firstJobs:'1'}:{})}).toString(),current=state?.key===key?state:undefined;
  const generation=useRef(0), inFlight=useRef<string|null>(null);
  function chooseSource(value:string){
    setSource(value);
    const url=new URL(window.location.href);url.searchParams.set('collectionSource',value);
    window.history.replaceState(window.history.state,'',url);
  }
  function chooseTopic(value:string){
    setTopic(value);
    const url=new URL(window.location.href);
    if(value) url.searchParams.set('collectionTopic',value); else url.searchParams.delete('collectionTopic');
    window.history.replaceState(window.history.state,'',url);
  }
  useEffect(()=>{
    const restore=()=>{
      const search=new URLSearchParams(window.location.search);
      setSource(search.get('collectionSource')??initialSource);
      setTopic(search.get('collectionTopic')??'');
    };
    window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[initialSource]);
  useEffect(()=>{
    const version=++generation.current,controller=new AbortController();
    inFlight.current=null;
    void fetch(`/api/noah/discover?${key}`,{cache:'no-store',signal:controller.signal}).then(async r=>{
      const page=await r.json() as Page & {error?:string;restart?:boolean};
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'一覧を読み込めませんでした。');
      if(version===generation.current)setState({key,page});
    }).catch(e=>{if(!controller.signal.aborted && version===generation.current)setState({key,error:e.message});});
    return ()=>controller.abort();
  },[key,attempt]);
  async function more(){
    if(!current?.page?.nextCursor || current.more || inFlight.current)return;
    const cursor=current.page.nextCursor,version=generation.current, requestKey=`${key}:${version}:${cursor}`;
    inFlight.current=requestKey;
    setState({...current,more:true,error:undefined});
    try{
      const params=new URLSearchParams(key);params.set('cursor',cursor);params.delete('firstJobs');
      const r=await fetch(`/api/noah/discover?${params}`,{cache:'no-store'}),page=await r.json() as Page & {error?:string;restart?:boolean};
      if(r.status===409 && page.restart){
        if(version!==generation.current)return;
        if(page.ownerScope!==current.page.ownerScope){setState(undefined);setAttempt(n=>n+1);return;}
        setState(old=>old?.key===key?{...old,more:false,error:page.error,restart:true}:old);
        return;
      }
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'続きを読み込めませんでした。');
      if(version!==generation.current)return;
      if(page.nextCursor===cursor)throw Error('続きを確認できませんでした。再試行してください。');
      if(page.ownerScope!==current.page.ownerScope){setState(undefined);setAttempt(n=>n+1);return;}
      const known=new Set(current.page.items.map(i=>i.feedbackId??i.id));
      setState(old=>old?.key===key && old.page ? {key,page:{...page,firstJobs:old.page.firstJobs,items:[...old.page.items,...page.items.filter(i=>{const id=i.feedbackId??i.id;if(known.has(id))return false;known.add(id);return true;})]}}:old);
    }catch(e){if(version===generation.current)setState(old=>old?.key===key?{...old,more:false,error:e instanceof Error?e.message:'続きを読み込めませんでした。'}:old);}
    finally{if(inFlight.current===requestKey)inFlight.current=null;}
  }
  async function hide(id:string){
    if(!current?.page)return;
    const version=generation.current;
    const r=await fetch('/api/noah/boards',{method:'POST',headers:{'Content-Type':'application/json','X-Rock-Owner-Scope':current.page.ownerScope??''},body:JSON.stringify({action:'hide',familyId:id})});
    if(version!==generation.current)return;
    if(r.ok)setState(old=>{
      if(old?.key!==key || !old.page)return old;
      const projectId=old.page.items.find(item=>item.id===id)?.feedbackId??id;
      const firstJobs=old.page.firstJobs?.filter(job=>!job.href || new URL(job.href,window.location.href).searchParams.get('id')!==projectId);
      return {...old,page:{...old.page,firstJobs,items:old.page.items.filter(item=>item.id!==id)}};
    });
    else setState({...current,error:'非表示にできませんでした。再試行してください。'});
  }
  const end=useNoahAutoPage(Boolean(current?.page && !current.more && !current.error),current?.page?.nextCursor,more);
  const availableJobs=current?.page?.firstJobs?.filter((job):job is NoahFirstJob & {href:string}=>job.href!==null);
  return <><span id="timeline" /><span id="first-jobs" tabIndex={-1} />
  <section id="noah-collection" className={styles.home} aria-label="Agent一覧">
    <div className={styles.feedHeading}><h1>{t(searchQuery ? '検索結果' : source && source!=='noah' ? '新しく見つかったAgent' : 'Agentを見つける')}</h1>{current?.page && <span>{current.page.total.toLocaleString('ja-JP')}件</span>}</div>
    <div className={styles.catalogTools}><div className={styles.filters} aria-label="Agentを絞り込む">{[['noah','接続できる'],['','すべて'],['discovered','新しく見つかった']].map(([value,label])=><button key={value} type="button" aria-pressed={source===value} onClick={()=>chooseSource(value)}>{label}</button>)}</div>
    <select className={styles.topicSelect} aria-label={t('カテゴリ')} value={topic} onChange={event=>chooseTopic(event.currentTarget.value)}>
      <option value="">{t('すべてのカテゴリ')}</option>
      {Object.entries(NOAH_PIN_TOPIC_LABELS).map(([id,label])=><option key={id} value={id}>{t(label)}</option>)}
    </select></div>
    {source!=='noah' && <details className={styles.sourceFilter}><summary>提供元で絞り込む</summary><div className={styles.filters}>{NOAH_COLLECTION_SOURCES.map(value=><button key={value} type="button" aria-pressed={source===value} onClick={()=>chooseSource(value)}>{NOAH_COLLECTION_LABELS[value]}</button>)}</div></details>}
    {source!=='noah' && <div className={styles.filters} aria-label="並び">
      <button type="button" aria-pressed={order==='hot'} onClick={()=>setOrder('hot')}>おすすめ順</button>
      <button type="button" aria-pressed={order==='new'} onClick={()=>setOrder('new')}>出た順</button>
    </div>}
    {(searchQuery && onClearQuery) && <button type="button" className={styles.recovery} onClick={()=>{onClearQuery?.();}}>検索条件をクリア</button>}
    {!current && <NoahLoading label="読み込んでいます…" variant="cards"/>}
    {current?.error && <div role="alert" className={styles.status}>{current.error}<button type="button" className={styles.recovery} onClick={()=>current.page&&!current.restart?void more():setAttempt(n=>n+1)}>{current.restart?'一覧を読み直す':'再試行'}</button></div>}
    {current?.page?.items.length===0 && <p className={styles.status}>この条件のAgentはまだありません。</p>}
    {current?.page && <NoahPinGrid jobs={availableJobs} items={current.page.items} signedIn={current.page.ownerScope!==null} ownerScope={current.page.ownerScope} onChange={(id,savedIn)=>setState(old=>old?.key===key && old.page?{...old,page:{...old.page,items:old.page.items.map(i=>i.id===id?{...i,savedIn}:i)}}:old)} onHide={id=>void hide(id)}/>}
    {current?.page?.nextCursor && <output ref={end} className={styles.moreRow} data-noah-feed-end aria-live="polite">{current.more?'読み込み中…':''}</output>}
    {current?.error && !current.page && fallback}
  </section>{showFirstJobs && <NoahStoreServices />}</>;
}
