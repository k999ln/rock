'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { xTimelineWidgetUrl } from '@/lib/sky-x-embed';
import type { SkyHubPlugin } from '@/lib/sky-hub';
import type { XFeedSnapshot } from '@/lib/sky-x-feed';
import styles from './sky-information-market.module.css';

const subscribeDevice = () => () => {};
const androidSnapshot = () => /Android/i.test(navigator.userAgent);
const serverDeviceSnapshot = () => false;

export default function SkyXTimeline({ plugin }: { plugin: SkyHubPlugin }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [channel] = useState(() => crypto.randomUUID());
  const [status, setStatus] = useState<'loading'|'ready'|'unavailable'>('loading');
  const [feed,setFeed] = useState<XFeedSnapshot|null>(null);
  const [retryAt,setRetryAt] = useState(0);
  const [showPublic,setShowPublic] = useState(false);
  const android = useSyncExternalStore(subscribeDevice,androidSnapshot,serverDeviceSnapshot);
  const cooldownKey=`sky.x.embed.cooldown:${plugin.resource}`;
  useEffect(()=>{
    if(!showPublic)return;
    const controller=new AbortController();
    void(async()=>{try{
      const response=await fetch(`/api/sky/x-feed?${new URLSearchParams({source:plugin.resource})}`,{cache:'no-store',signal:controller.signal});
      const value=await response.json() as XFeedSnapshot;
      if(!response.ok||!Array.isArray(value.posts))throw new Error('unavailable');
      if(controller.signal.aborted)return;setFeed(value);
      if(value.mode==='embed'){
        try{const until=Number(window.sessionStorage.getItem(cooldownKey));if(until>Date.now()){setRetryAt(until);setStatus('unavailable');}}catch{/* Private browsing may disable session storage. */}
      }else if(value.retryAt<=Date.now()){
        const refreshed=await fetch('/api/sky/x-feed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:plugin.resource,revision:plugin.revision}),signal:controller.signal});
        const result=await refreshed.json() as XFeedSnapshot;if(!refreshed.ok||!Array.isArray(result.posts))throw new Error('unavailable');if(!controller.signal.aborted)setFeed(result);
      }
    }catch{if(!controller.signal.aborted)setStatus('unavailable');}})();
    return()=>controller.abort();
  },[plugin.resource,plugin.revision,cooldownKey,showPublic]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.type !== 'sky-x-widget' || event.data?.channel !== channel) return;
      if (process.env.NODE_ENV === 'development' && ['started','sdk-loaded','ready','unavailable'].includes(event.data.status)) console.info('Sky X widget:',event.data.status);
      if (event.data.status === 'ready' || event.data.status === 'unavailable') {
        setStatus(event.data.status);
        if(event.data.status==='unavailable'){const until=Date.now()+15*60_000;setRetryAt(until);try{window.sessionStorage.setItem(cooldownKey,String(until));}catch{/* No storage available. */}}
      }
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); };
  }, [channel,cooldownKey]);
  useEffect(()=>{
    if(feed?.mode!=='embed'||status!=='loading')return;
    const timeout=window.setTimeout(()=>{setStatus('unavailable');const until=Date.now()+15*60_000;setRetryAt(until);try{window.sessionStorage.setItem(cooldownKey,String(until));}catch{/* No storage available. */}},25000);
    return()=>window.clearTimeout(timeout);
  },[feed?.mode,status,cooldownKey]);
  return <article className={styles.timelineCard}>
    <header><strong>{plugin.metadata.title}</strong><a href={plugin.resource} target="_blank" rel="noopener noreferrer">Xで原文 <ArrowUpRight size={14}/></a></header>
    <section className={styles.xAccountEntry} aria-label="自分のXタイムライン">
      <strong>いつものXを、そのまま。</strong>
      <p>自分のアカウントで、フォロー中の投稿やおすすめを読めます。</p>
      <div><a href="https://x.com/home" target="_blank" rel="noopener noreferrer">自分のXを開く <ArrowUpRight size={16}/></a>
      {android&&<a href="intent://home#Intent;scheme=rockstarx;package=dev.rock.xsession;S.browser_fallback_url=https%3A%2F%2Fx.com%2Fhome;end">Pixelの専用ビューで開く</a>}</div>
      <small>X公式画面でログインします。ブラウザは別画面、Pixelの専用ビューは追加アプリで開きます。</small>
    </section>
    <button className={styles.xPublicToggle} type="button" aria-expanded={showPublic} onClick={()=>setShowPublic(value=>!value)}>{showPublic?'公開配信を閉じる':'追加した配信元の公開投稿を見る'}</button>
    {showPublic&&<>
    {!feed&&status==='loading'&&<output className={styles.timelineStatus}>配信状態を確認しています…</output>}
    {feed?.mode==='embed'&&status==='loading'&&<output className={styles.timelineStatus}>Xの公開投稿を読み込んでいます…</output>}
    {feed?.mode==='embed'&&status !== 'unavailable' && <iframe ref={frame} title={`${plugin.metadata.title} の公開投稿`} src={xTimelineWidgetUrl(plugin.resource, channel)} sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer"/>}
    {status === 'unavailable' && <output className={styles.timelineStatus}>Xから公開投稿を受信できませんでした。原文リンクから確認できます。{retryAt>0&&` 次の埋込み確認は${new Date(retryAt).toLocaleTimeString('ja-JP',{hour:'2-digit',minute:'2-digit'})}以降です。`}</output>}
    {feed?.mode==='api'&&<div className={styles.xPosts}>
      {feed.posts.map(post=><article key={post.id}><header><a href={`https://x.com/${post.author}`} target="_blank" rel="noopener noreferrer"><strong>{post.name}</strong> @{post.author}</a><span aria-label="X">𝕏</span></header><p>{post.text}</p><a href={post.url} target="_blank" rel="noopener noreferrer"><time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleString('ja-JP')}</time> · Xで投稿を見る <ArrowUpRight size={13}/></a></article>)}
      {!feed.posts.length&&<output className={styles.timelineStatus}>{feed.status==='ready'?'配信元に表示できる公開投稿はありません。':'公式APIの認証・残高・取得枠または配信状態を確認してください。'}</output>}
      {feed.fetchedAt>0&&<p className={styles.note}>取得：{new Date(feed.fetchedAt).toLocaleString('ja-JP')}。{feed.status!=='ready'?'更新待ちのため前回取得した投稿です。':'配信元の公開投稿です。'}</p>}
    </div>}
    </>}
    <p>配信・並び順はXが提供します。投稿の事実確認済み表示ではありません。</p>
  </article>;
}
