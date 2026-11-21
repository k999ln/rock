'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useNoahProfile} from './use-noah-profile';
import {OWNER_SCOPE_HEADER} from '@/lib/owner-intent';
import NoahLoading from './noah-loading';
import styles from './noah-registration-browser.module.css';
type Frame={id:string;state:string;image?:string;sequence?:number;error?:string};
export default function NoahRegistrationBrowser({job,provider}:{job:string;provider:string}){
  const vault=useNoahProfile(),query=new URLSearchParams({job,provider}).toString();
  return <section className={styles.root}>
    <header><Link href="/noah/registration">← 登録へ戻る</Link><h1>本人確認をお願いします</h1><p>必要な確認が終わったら「確認できた」を押してください。</p></header>
    {vault.error?<p role="alert">{vault.error} <button onClick={()=>void vault.reload()}>再読み込み</button></p>:vault.guest?<Link href={`/noah/account?returnTo=${encodeURIComponent(`/noah/registration/browser?${query}`)}`}>サインインして続ける</Link>:vault.profile?<BrowserSession key={`${query}:${vault.profile.ownerScope}`} query={query} ownerScope={vault.profile.ownerScope}/>:<NoahLoading label="登録画面を読み込み中"/>}
  </section>;
}
function BrowserSession({query,ownerScope}:{query:string;ownerScope:string}){
  const [frame,setFrame]=useState<Frame|null>(null),[error,setError]=useState(''),[text,setText]=useState(''),[busy,setBusy]=useState(false);
  const active=useRef(true),lock=useRef(false),sequence=useRef(0),reads=useRef(0),terminalRef=useRef(false);
  const send=useCallback(async(action?:string,input?:Record<string,unknown>)=>{
    if(lock.current||!active.current)return;lock.current=true;setBusy(true);setError('');
    try{
      const response=await fetch(`/api/noah/registration/browser?${query}`,{method:action?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(25000),...(action?{headers:{'Content-Type':'application/json',[OWNER_SCOPE_HEADER]:ownerScope},body:JSON.stringify({action,...(input?{input:{...input,sequence:sequence.current+1}}:{})})}:{})});
      const data=await response.json() as Frame;
      if(!active.current)return;if(!response.ok)throw Error(data.error??'画面を読み直してください。');
      if(typeof data.sequence==='number')sequence.current=data.sequence;
      terminalRef.current=['completed','failed','unknown'].includes(data.state);
      setFrame(current=>({...data,image:data.image??(data.state==='needs_user'?current?.image:undefined)}));
    }catch(e){if(active.current)setError(e instanceof Error?e.message:'通信を確認してください。');}
    finally{if(active.current){lock.current=false;setBusy(false);}}
  },[query,ownerScope]);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  useEffect(()=>{
    let stopped=false;let timer:ReturnType<typeof setTimeout>;
    const tick=async()=>{if(stopped||terminalRef.current||reads.current>=80)return;if(document.visibilityState==='visible'){reads.current++;await send();}if(!stopped)timer=setTimeout(tick,3000);};
    void tick();return()=>{stopped=true;clearTimeout(timer);};
  },[send]);
  const terminal=frame&&['completed','failed','unknown'].includes(frame.state);
  return <>
    {error&&<p role="alert">{error} <button onClick={()=>void send()} disabled={busy}>読み直す</button></p>}
    {!frame?<NoahLoading label="登録画面を読み込み中"/>:terminal?<output>{frame.state==='completed'?'接続の準備ができました。登録へ戻ってAgentを使えます。':frame.state==='failed'?'登録の操作を停止しました。':'登録の結果を確認してください。自動で登録し直すことはありません。'}</output>:<>
      <div className={styles.screen} aria-label="登録先の専用ブラウザ">
        {frame.image&&<button className={styles.screenButton} aria-label="登録先の画面を操作" disabled={busy} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();void send('input',{kind:'click',x:event.detail===0?195:(event.clientX-rect.left)*390/rect.width,y:event.detail===0?320:(event.clientY-rect.top)*640/rect.height});}}><Image src={`data:image/jpeg;base64,${frame.image}`} alt="登録先の確認画面。入力欄をタップして下の欄から文字を送れます。" width={390} height={640} unoptimized draggable={false}/></button>}
      </div>
      <form onSubmit={event=>{event.preventDefault();const value=text;setText('');void send('input',{kind:'text',text:value});}} className={styles.input}><input type="password" value={text} autoComplete="off" aria-label="選んだ欄へ入力" placeholder="画面の入力欄を選んで、ここに入力" onChange={event=>setText(event.target.value)} maxLength={1024}/><button disabled={busy||!text}>入力</button></form>
      <div className={styles.controls}><button disabled={busy} onClick={()=>void send('input',{kind:'key',key:'Tab'})}>次の欄</button><button disabled={busy} onClick={()=>void send('input',{kind:'key',key:'Backspace'})}>1文字消す</button><button disabled={busy} onClick={()=>void send('input',{kind:'scroll',delta:-480})}>↑</button><button disabled={busy} onClick={()=>void send('input',{kind:'scroll',delta:480})}>↓</button></div>
      <footer><button disabled={busy} onClick={()=>void send('cancel')}>停止する</button><button className={styles.primary} disabled={busy} onClick={()=>void send('resume')}>確認できた</button></footer>
    </>}
  </>;
}
