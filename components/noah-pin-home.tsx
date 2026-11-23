'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { NoahFirstJob } from '@/lib/noah-first-jobs';
import { useNoahLocale } from './noah-locale';
import { NOAH_PIN_TOPIC_LABELS } from '@/lib/noah-pins';
import { NOAH_COLLECTION_LABELS, NOAH_COLLECTION_SOURCES } from '@/lib/noah-collection';
import NoahPinGrid, {type NoahPinView} from './noah-pin-grid';
import NoahLoading from './noah-loading';
import NoahStoreEntry, { NoahStoreServices } from './noah-store-entry';
import styles from './noah-pins.module.css';
const purposeSections = [
  { title: 'お店・会社のサイト運営', ids: ['wordpress-maintenance', 'ec-production'] },
  { title: '自分のメモ整理', ids: ['memory'] },
];

type Page={items:NoahPinView[];nextCursor:string|null;ownerScope:string|null;total:number;firstJobs?:NoahFirstJob[]};
export default function NoahPinHome({fallback,searchQuery='',initialSource='noah',onClearQuery,showFirstJobs=false}:{fallback?:ReactNode;searchQuery?:string;initialSource?:string;onClearQuery?:()=>void;showFirstJobs?:boolean}) {
  const params=useSearchParams();
  const {t}=useNoahLocale();
  const [source,setSource]=useState(params.get('collectionSource')??initialSource),[attempt,setAttempt]=useState(0);
  const [topic,setTopic]=useState(params.get('collectionTopic')??'');
  const [order,setOrder]=useState<'hot'|'new'>('hot');
  const [state,setState]=useState<{key:string;page?:Page;error?:string;more?:boolean}>();
  const key=new URLSearchParams({q:searchQuery,source,order,cursor:'0',...(topic?{topic}:{}),...(showFirstJobs?{firstJobs:'1'}:{})}).toString(),current=state?.key===key?state:undefined;
  const generation=useRef(0);
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
    void fetch(`/api/noah/discover?${key}`,{cache:'no-store',signal:controller.signal}).then(async r=>{
      const page=await r.json() as Page & {error?:string};
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'一覧を読み込めませんでした。');
      if(version===generation.current)setState({key,page});
    }).catch(e=>{if(!controller.signal.aborted && version===generation.current)setState({key,error:e.message});});
    return ()=>controller.abort();
  },[key,attempt]);
  useEffect(()=>{
    const update=()=>{if(!document.hidden && (current?.page?.items.length??0)<=20)setAttempt(n=>n+1);};
    const timer=setInterval(update,60_000);window.addEventListener('focus',update);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',update);};
  },[current?.page?.items.length]);
  async function more(){
    if(!current?.page?.nextCursor || current.more)return;
    const cursor=current.page.nextCursor,version=generation.current;
    setState({...current,more:true,error:undefined});
    try{
      const params=new URLSearchParams(key);params.set('cursor',cursor);params.delete('firstJobs');
      const r=await fetch(`/api/noah/discover?${params}`,{cache:'no-store'}),page=await r.json() as Page & {error?:string};
      if(!r.ok || !Array.isArray(page.items))throw Error(page.error??'続きを読み込めませんでした。');
      if(version!==generation.current)return;
      if(page.ownerScope!==current.page.ownerScope){setAttempt(n=>n+1);return;}
      const known=new Set(current.page.items.map(i=>i.feedbackId??i.id));
      setState(old=>old?.key===key && old.page ? {key,page:{...page,firstJobs:old.page.firstJobs,items:[...old.page.items,...page.items.filter(i=>!known.has(i.feedbackId??i.id))]}}:old);
    }catch(e){if(version===generation.current)setState({...current,error:e instanceof Error?e.message:'続きを読み込めませんでした。'});}
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
  const availableJobs=current?.page?.firstJobs?.filter((job):job is NoahFirstJob & {href:string}=>job.href!==null);
  return <>{showFirstJobs && <NoahStoreEntry jobs={availableJobs} items={current?.page?.items ?? []}/>}
  {showFirstJobs && <section className={styles.firstJobs} id="first-jobs" tabIndex={-1} aria-labelledby="noah-first-jobs-title">
    <h2 id="noah-first-jobs-title">{t('何をしたいですか？')}</h2>
    {availableJobs?.length ? purposeSections.map(section => {
      const jobs = availableJobs.filter(job => section.ids.includes(job.id));
      if (jobs.length === 0) return null;
      return <div className={styles.purposeSection} key={section.title}>
        <h3>{t(section.title)}</h3>
        <ul>{jobs.map(job => <li key={job.id}>
          <Link href={job.href}><span><strong>{t(job.title)}</strong><small>{t(job.output)}</small></span><ChevronRight size={18} aria-hidden="true"/></Link>
        </li>)}</ul>
      </div>;
    }) : <output>{t(!current ? '利用できる仕事を確認しています…' : availableJobs ? '今選べる仕事はありません。' : '今選べる仕事を確認できませんでした。')}</output>}
    <nav className={styles.firstJobLinks} aria-label={t('仕事を探す・成果を見る')}>
      <Link href="/noah/explore">{t('ほかの仕事を探す')}</Link>
      <Link href="/noah/saved?tab=results">{t('保存した成果を見る')}</Link>
    </nav>
  </section>}
  {showFirstJobs && <NoahStoreServices />}
  <section id="noah-collection" className={styles.home} aria-label="Agent一覧">
    <div className={styles.feedHeading}><h2>{t(searchQuery ? '検索結果' : source && source!=='noah' ? '新しく見つかったAgent' : 'Agentを見つける')}</h2>{current?.page && <span>{current.page.total.toLocaleString('ja-JP')}件</span>}</div>
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
    {current?.error && <div role="alert" className={styles.status}>{current.error}<button type="button" className={styles.recovery} onClick={()=>current.page?void more():setAttempt(n=>n+1)}>再試行</button></div>}
    {current?.page?.items.length===0 && <p className={styles.status}>この条件のAgentはまだありません。</p>}
    {current?.page && <NoahPinGrid presentation="store" items={current.page.items} signedIn={current.page.ownerScope!==null} ownerScope={current.page.ownerScope} onChange={(id,savedIn)=>setState(old=>old?.key===key && old.page?{...old,page:{...old.page,items:old.page.items.map(i=>i.id===id?{...i,savedIn}:i)}}:old)} onHide={id=>void hide(id)}/>}
    {current?.page?.nextCursor && <div className={styles.moreRow}><button type="button" disabled={current.more} onClick={()=>void more()}>{current.more?'読み込み中…':'もっと見る'}</button></div>}
    {current?.error && !current.page && fallback}
  </section></>;
}
