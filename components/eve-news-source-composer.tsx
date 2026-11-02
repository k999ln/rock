'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { newsSourceNavigation } from '@/lib/eve-noah-navigation';
import { prepareNewsSourceNote } from '@/lib/eve-news-source-note';
import styles from './sky-commerce.module.css';
const subscribeLocation=()=>()=>{};
export default function EveNewsSourceComposer({disabled,onPrepare,append=false}:{disabled:boolean;append?:boolean;onPrepare:(value:Awaited<ReturnType<typeof prepareNewsSourceNote>>)=>void}) {
 const alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const query=useSyncExternalStore(subscribeLocation,()=>window.location.search,()=>''),q=new URLSearchParams(query);
 const [open,setOpen]=useState<boolean|null>(null),[editedUrl,setUrl]=useState<string|null>(null),[editedTitle,setTitle]=useState<string|null>(null);
 const url=editedUrl??(q.get('newsSource')??''),title=append?'追加資料':editedTitle??(q.get('sourceTitle')??'').slice(0,240);
 const [excerpt,setExcerpt]=useState(''),[rights,setRights]=useState(''),[published,setPublished]=useState(''),[sourceType,setSourceType]=useState('licensed_reporting');
 const seenAt=editedUrl===null?(q.get('sourceSeenAt')??''):'',stale=editedUrl===null&&q.get('sourceStale')==='true';
 const original=newsSourceNavigation(new URLSearchParams({newsSource:url}).toString());
 const [working,setWorking]=useState(false),[error,setError]=useState('');
 async function prepare(){setWorking(true);setError('');try{const value=await prepareNewsSourceNote({url,title,excerpt,rights,publishedAt:published,sourceType,seenAt,stale},crypto.randomUUID());if(alive.current)onPrepare(value);}catch{if(alive.current)setError('URL・見出し・本文範囲・利用権・UTC日時を確認してください。');}finally{if(alive.current)setWorking(false);}}
 return <details className={styles.purchaseConditions} open={open??q.has('newsSource')} onToggle={e=>setOpen(e.currentTarget.open)}><summary>{append?'同じ仕事へ追加する資料を入力':'出典リンクから資料メモを作る'}</summary><div className={styles.offerForm}>
  <p>原文を開き、保存・要約・引用できる範囲を本人が入力します。リンクの検出だけでは本文・発行時刻・利用権・真偽は確認できません。ここではモデルを呼び出しません。</p>
  {original&&<p><a href={original.href} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">資料の原文を開く</a></p>}
  <label>出典のHTTPS URL<input value={url} maxLength={2048} disabled={disabled||working} onChange={e=>{setUrl(e.target.value);setRights('');}}/></label>
  {!append&&<label>資料メモの見出し<input value={title} maxLength={240} disabled={disabled||working} onChange={e=>setTitle(e.target.value)}/></label>}
  {seenAt&&<p>引継ぎのGDELT検出時刻（未照合）: {seenAt}{stale?' · 前回取得分':''}。記事の発行時刻とは別です。</p>}
  <label className={styles.selectLabel}>資料の種類<select value={sourceType} disabled={disabled||working} onChange={e=>setSourceType(e.target.value)}><option value="licensed_reporting">報道資料</option><option value="primary_record">一次記録</option><option value="on_record_statement">発言記録</option><option value="correction_or_retraction">訂正・撤回</option></select></label>
  <label>確認できた発行時刻（UTC。空欄は不明）<input placeholder="2026-10-22T12:00:00Z" value={published} maxLength={64} disabled={disabled||working} onChange={e=>setPublished(e.target.value)}/></label>
  <label>利用できる原文の範囲（1,000文字まで）<textarea value={excerpt} maxLength={1000} disabled={disabled||working} onChange={e=>{setExcerpt(e.target.value);setRights('');}}/></label>
  <label className={styles.selectLabel}>素材の利用権を本人が確認<select value={rights} disabled={disabled||working} onChange={e=>setRights(e.target.value)}><option value="">未確認・準備できません</option><option value="owner_authored">自分が作成した素材</option><option value="summarize_and_quote">保存・要約・引用の利用権を確認した素材</option></select></label>
  <p>{append?'追加資料を準備します。主張台帳や本文へ自動反映はしません。':'未確認の主張を含む作業メモとして準備します。'}掲載・学習への利用許可やモデル生成済みの記事にはなりません。次の保存同意までアカウントへ送りません。</p>
  {error&&<p role="alert">{error}</p>}<button disabled={disabled||working||!url||!title.trim()||!excerpt.trim()||!rights} onClick={()=>void prepare()}>{append?'追加資料を準備':'資料メモを準備'}</button>
 </div></details>;
}
