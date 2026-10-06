'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Globe2, Laptop, Link2, Loader2, RefreshCw, Smartphone } from 'lucide-react';
import WorkspaceShell from '@/components/workspace-shell';
import SkyNavigation from '@/components/sky-navigation';
import SkyMcpCenter from '@/components/sky-mcp-center';
import SkyConnectionCenter from '@/components/sky-connection-center';
import SkyActivationPanel from '@/components/sky-activation-panel';
import { ExecutionSignin, requestExecutionAccessCheck, useExecutionAccess } from '@/components/execution-access';
import { DeviceConnection } from '@/components/device-connection';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { connectDevice, deviceToken, verifyDevice } from '@/lib/device';
import { createNetworkSession, networkServiceHint, type NetworkState } from '@/lib/sky-network-session';
import { networkDeviceHint } from '@/lib/sky-network-device';
import frame from '@/components/sky-application.module.css';
import styles from './sky-network.module.css';

export default function SkyNetwork() {
  const access = useExecutionAccess();
  const [mcpOpen,setMcpOpen]=useState(false);
  const [providerOpen,setProviderOpen]=useState(false);
  const [deviceOpen,setDeviceOpen]=useState(false);
  const [hint,setHint]=useState<ReturnType<typeof networkDeviceHint> | null>(null);
  const [browserOnline,setBrowserOnline]=useState(true);
  const [session,setSession]=useState<NetworkState>({status:'idle',pending:false,message:''});
  const [slow,setSlow]=useState(false);
  const controller=useRef<ReturnType<typeof createNetworkSession> | null>(null);
  const accessRef=useRef(access.accessState);
  useEffect(()=>{accessRef.current=access.accessState;},[access.accessState]);
  const service=networkServiceHint(access.accessState);
  useEffect(()=>{
    const flow=createNetworkSession({online:()=>networkServiceHint(accessRef.current).mayCheckDevice,hasToken:()=>!!deviceToken(),verify:verifyDevice,connect:connectDevice,changed:setSession});
    controller.current=flow;
    const initial=window.setTimeout(()=>{setHint(networkDeviceHint(navigator.userAgent,navigator.maxTouchPoints));setBrowserOnline(navigator.onLine);},0);
    const deviceUpdate=()=>{if(networkServiceHint(accessRef.current).mayCheckDevice)void flow.check();else flow.pause();};
    const networkUpdate=()=>{setBrowserOnline(navigator.onLine);flow.pause();requestExecutionAccessCheck();};
    window.addEventListener('loop-device',deviceUpdate);window.addEventListener('online',networkUpdate);window.addEventListener('offline',networkUpdate);
    return()=>{flow.dispose();controller.current=null;window.clearTimeout(initial);window.removeEventListener('loop-device',deviceUpdate);window.removeEventListener('online',networkUpdate);window.removeEventListener('offline',networkUpdate);};
  },[]);
  useEffect(()=>{
    if(networkServiceHint(access.accessState).mayCheckDevice)void controller.current?.check();
    else controller.current?.pause();
  },[access.accessState]);
  useEffect(()=>{
    const timer=window.setTimeout(()=>setSlow(session.pending),session.pending?6000:0);
    return()=>window.clearTimeout(timer);
  },[session.pending]);
  const connection=session.status;
  const busy=session.pending;
  const message=session.message;
  function connect(){
    if(access.executionBlocked) return;
    if(connection==='connected'){setMcpOpen(true);return;}
    void controller.current?.connect();
  }
  const connected=connection==='connected'&&!access.executionBlocked;
  const DeviceIcon=hint?.mobile?Smartphone:Laptop;
  return <div className={frame.frame}><WorkspaceShell title="Sky · 接続" tone="sky" hideTopActions contentClassName={styles.shell}>
    <div className={styles.page}>
      <SkyNavigation active="network" />
      <header className={styles.header}><p className={styles.eyebrow}>CONNECTIONS</p><h1>つないで、すぐに。</h1><p>端末に合った使い方を、Skyが案内します。</p></header>
      <ExecutionSignin state={access.accessState}/>
      <section className={styles.device} aria-label="この端末">
        <div className={styles.deviceIcon}><DeviceIcon size={34} strokeWidth={1.3}/></div>
        <div className={styles.deviceInfo}><span className={styles.eyebrow}>THIS DEVICE</span><h2>{hint?`この${hint.name}`:'端末を確認中…'}</h2><p>{hint?'ブラウザ情報から自動判定':'接続に合った案内を準備しています'}</p></div>
        <span className={styles.status}><span className={service.reachable?styles.dot:styles.offlineDot}/>{service.label}</span>
      </section>
      {!browserOnline && !service.reachable && access.accessState==='unavailable' && <output className={styles.notice}>端末の通信設定を確認して、もう一度確認してください。</output>}
      <div className={styles.routes}>
        <section className={styles.route}>
          <div className={styles.row}><Globe2 size={22} strokeWidth={1.4}/><span className={styles.tag}>追加の端末設定なし</span></div>
          <h2>ブラウザで使う</h2><p>Web対応のツールは、このまま。実行履歴と仕事はZemaで確認できます。</p>
          <Link className={hint?.mobile?styles.primary:styles.secondary} href="/chat?view=work">Zemaで仕事を確認 <ArrowRight size={16}/></Link>
        </section>
        <section className={`${styles.route} ${!hint?.mobile?styles.recommended:''}`}>
          <div className={styles.row}><Laptop size={22} strokeWidth={1.4}/><span className={styles.tag}>{connected?'接続確認済み':hint?.mobile?'PCがあるときに':'この端末に合わせて案内'}</span></div>
          <h2>{connected?'このPCにつながっています':hint?.mobile?'PCのツールも使う':'PCのツールをつなぐ'}</h2>
          <p>{hint?.connectorHint ?? '端末の種類を確認しています。'}</p>
          {hint?.mobile?<Link className={styles.secondary} href="/sky">Web対応ツールを探す <ArrowRight size={16}/></Link>:<button className={styles.primary} disabled={access.executionBlocked||!hint||busy||connection==='checking'} onClick={connect}>
            {busy||connection==='checking'?<Loader2 size={16} className={styles.spin}/>:connected?<Check size={16}/>:<Link2 size={16}/>}
            {connection==='checking'?'接続を確認中…':busy?'この端末を確認中…':connected?'使えるツールを選ぶ':connection==='failed'?'もう一度接続する':`この${hint?.name ?? 'PC'}を接続`}
          </button>}
          {!hint?.mobile && <output className={styles.connectionFeedback} aria-live="polite" aria-atomic="true">
            {busy ? <><span>{slow?'通常より時間がかかっています。':'端末の接続機能を確認しています。'}</span><span className={styles.feedbackDetail}>{slow?'このままお待ちください。応答がなければ再試行できます。':'接続が確認できるまで、ツールは実行されません。'}</span></> : connection==='failed' ? <><strong>接続できませんでした</strong><span className={styles.feedbackDetail}>{message}</span><span>接続アプリとネットワークを確認して、もう一度接続してください。</span></> : connected ? <span>接続確認済み</span> : <span>接続操作は、この端末から始められます。</span>}
          </output>}
          {!hint?.mobile && <button className={styles.textButton} onClick={()=>setDeviceOpen(true)}>うまくつながらない場合</button>}
        </section>
      </div>
      {message && connection!=='failed' && !busy && <output className={styles.notice}>{message}</output>}
      <section className={styles.service}>
        <div className={styles.serviceIcon}><Link2 size={21}/></div><div><h2>外部サービス・AIモデル</h2><p>使うツールに必要なサービスだけ、あとから追加。</p></div><button className={styles.secondary} onClick={()=>setProviderOpen(true)}>接続を管理 <ArrowRight size={15}/></button>
      </section>
      <footer className={styles.footer}><span>端末の判定は表示の案内に使います。機種名や購入権は自動判定しません。</span><button disabled={busy||connection==='checking'} onClick={()=>{setHint(networkDeviceHint(navigator.userAgent,navigator.maxTouchPoints));setBrowserOnline(navigator.onLine);controller.current?.pause();requestExecutionAccessCheck();}}><RefreshCw size={13}/>もう一度確認</button></footer>
      <details className={styles.advanced}><summary>その他の接続方法</summary><div><h2>Telegramから使う</h2><SkyActivationPanel/></div></details>
    </div>
    <SkyMcpCenter showStatusRail={false} open={mcpOpen} connected={connected} onOpenChange={setMcpOpen} onOpenDevice={()=>{setMcpOpen(false);setDeviceOpen(true);}}/>
    <SkyConnectionCenter open={providerOpen} onOpenChange={setProviderOpen}/>
    <Dialog open={deviceOpen} onOpenChange={setDeviceOpen}><DialogContent className={styles.deviceDialog}><DialogTitle>PCの接続を設定</DialogTitle><DialogDescription>接続できない場合の手順と詳細設定です。</DialogDescription><DeviceConnection connectionBlocked={access.executionBlocked}/></DialogContent></Dialog>
  </WorkspaceShell></div>;
}
