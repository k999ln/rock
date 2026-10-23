'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import Link from 'next/link';
import styles from './eve-agent-composer.module.css';
import EveInteractionPanel from './eve-interaction-panel';
import {createPurposeRuntimeEveWorkPort,createLibraryRuntimeEveWorkPort,purposeEvePendingKey,libraryEvePendingKey,draftEvePurposeRole} from '@/lib/eve-purpose-runtime-work-port';
import type {EveRuntimePresence} from '@/lib/sky-eve-connections';
import type {SkyLibraryAgent} from '@/lib/sky-agent-library';
import type {EveInteractionPhase} from '@/lib/rockstar-eve-interaction';
type Options=Parameters<typeof createPurposeRuntimeEveWorkPort>[0];
type Props={owner:string;threadId:string;observedAt:number;devices:EveRuntimePresence[];api:Options['api'];current:()=>boolean;onConversation:()=>void;agent?:SkyLibraryAgent};
function BoundComposer({options,agent,connected,current,onPhase}:{options:Omit<Options,'storage'|'continuing'>;agent?:SkyLibraryAgent;connected:boolean;current:()=>boolean;onPhase:(phase:EveInteractionPhase)=>void}){
 const currentRef=useRef(current),active=useRef(true);
 useLayoutEffect(()=>{currentRef.current=current;},[current]);
 const [work]=useState(()=>{
  const raw={...options,continuing:()=>active.current&&currentRef.current(),storage:{getItem:(k:string)=>window.sessionStorage.getItem(k),setItem:(k:string,v:string)=>window.sessionStorage.setItem(k,v),removeItem:(k:string)=>window.sessionStorage.removeItem(k)}};
  return agent?createLibraryRuntimeEveWorkPort({...raw,agent}):createPurposeRuntimeEveWorkPort(raw);
 });
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const key=agent?libraryEvePendingKey(options,agent):purposeEvePendingKey(options);
 return <EveInteractionPanel textFirst work={work} pendingKey={key} connected={connected} onPhase={onPhase} preparesAgent={!agent}
  previewRole={agent?undefined:input=>draftEvePurposeRole(input,options.modelId)}
  executionNotice={`${agent?'smisで選んだこの版の担当':'確認した目的から作る文章担当'}を、選んだ実行先に登録して実行します。端末内の準備済みモデルを使い、出力上限は256トークン、クラウド使用料は0円です。会話と下書きは同じアカウントへ同期します。`} />;
}
/** Both Web and Pixel use the same account queue; UI does not hold an executor credential. */
export default function EveAgentComposer(props:Props){
 const [target,setTarget]=useState(''),[modelId,setModel]=useState(''),[phase,setPhase]=useState<EveInteractionPhase>('disabled');
 const targets=props.devices.filter(d=>d.host.capabilities['agent.prepare']===true);
 const device=targets.find(d=>d.deviceId===target);
 const models=device?.models.filter(m=>m.scheme==='gguf-sha256'&&device.preparedModels.includes(m.id)&&(!props.agent||m.id===props.agent.model))??[];
 const model=models.find(m=>m.id===(modelId||models[0]?.id));
 const supported=!props.agent||(props.agent.source==='personal'&&props.agent.sourceTool===null&&props.agent.enabled&&!('attachment' in props.agent&&props.agent.attachment)&&props.agent.provider==='local-model'&&/^[a-f0-9-]{36}$/.test(props.agent.id));
 const mutable=['disabled','standby','listening','review'].includes(phase);
 const connected=!!(props.owner&&supported&&device&&model&&device.phase==='ready'&&props.observedAt>0&&props.observedAt-device.updatedAt<30000);
 const options=props.owner&&device&&model?{owner:props.owner,threadId:props.threadId,deviceId:device.deviceId,modelId:model.id,modelScheme:'gguf-sha256' as const,modelSha256:model.sha256,api:props.api}:null;
 const key=options?(props.agent?libraryEvePendingKey(options,props.agent):purposeEvePendingKey(options)):'';
 return <section className={styles.composer} aria-label={props.agent?'smisの担当で実行':'Eveとの会話からエージェントを作る'}>
  <h3>{props.agent?'この担当で作る':'Eveに話して、担当を作る'}</h3>
  {!props.agent&&<p>どんな働きがほしいか入力し、Eveが整理した役割を確認します。作った担当は自分のsmisに保存され、WebとPixelの両方から使えます。</p>}
  {!supported?<p>この接続先はこの文章実行には未対応です。担当の接続方法を上で確認してください。</p>:<>
  <label>実行する端末<select disabled={!mutable} value={device?.deviceId??''} onChange={event=>{setTarget(event.target.value);setModel('');}}><option value="">接続した端末を選ぶ</option>{targets.map(d=><option key={d.deviceId} value={d.deviceId}>{d.name}</option>)}</select></label>
  <label>使うモデル<select disabled={!mutable||!!props.agent} value={model?.id??''} onChange={event=>setModel(event.target.value)}><option value="">準備済みのモデルを選ぶ</option>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
  {!connected&&<p>接続中で担当登録に対応する端末と、準備済みのモデルが必要です。PixelではTerminalのLinuxを起動し、RockstarOSの同期を開始してください。<Link href="/sky/devices">接続を確認する</Link></p>}
  {!props.threadId?<button type="button" disabled={!connected} onClick={props.onConversation}>この担当用の会話を始める</button>:options&&<BoundComposer key={key} options={options} agent={props.agent} current={props.current} connected={connected} onPhase={setPhase}/>}
  </>}
  <p><Link href="/#timeline">作った担当をsmisで見る</Link> · <Link href="/os/eve">Eveの会話・仕事・成果へ</Link></p>
 </section>;
}
