'use client';
import {useEffect, useState} from 'react';
import EveInteractionPanel from './eve-interaction-panel';
import {createRuntimeEveWorkPort, runtimeEvePendingKey, runtimeEveRestorableWork} from '@/lib/eve-runtime-work-port';
import {createPurposeRuntimeEveWorkPort,purposeEvePendingKey,draftEvePurposeRole} from '@/lib/eve-purpose-runtime-work-port';
import type {EveRuntimePending,EveRuntimeExecution} from '@/lib/eve-runtime-sync';
import type {EveWorkPort,EveWorkReference,EveInteractionPhase} from '@/lib/rockstar-eve-interaction';
type Binding=Parameters<typeof runtimeEvePendingKey>[0];
type Creation=Parameters<typeof purposeEvePendingKey>[0];
type Request=Parameters<typeof createRuntimeEveWorkPort>[0]['api'];
type Props={savedWork?:EveWorkReference[];binding:Binding|null;creation:Creation|null;api:Request;selectedConnected:boolean;creationConnected:boolean;supportsPurpose:boolean;current:()=>boolean};
function boundRuntime(props:Props,mode:'purpose'|'selected'){
 let active=true;const continuing=()=>active&&props.current();
 const work:EveWorkPort&{cancelPreparation?:()=>Promise<void>}=mode==='purpose'&&props.creation
  ?createPurposeRuntimeEveWorkPort({...props.creation,api:props.api,continuing,storage:{getItem:k=>window.sessionStorage.getItem(k),setItem:(k,v)=>window.sessionStorage.setItem(k,v),removeItem:k=>window.sessionStorage.removeItem(k)}})
  :props.binding?createRuntimeEveWorkPort({...props.binding,api:props.api,continuing}):(()=>{throw Error('担当かAIを選んでください。');})();
 return {work,activate:()=>{active=true;},retire:()=>{active=false;}};
}
function BoundPanel({props,mode,phase,onPhase}:{props:Props;mode:'purpose'|'selected';phase:EveInteractionPhase;onPhase:(phase:EveInteractionPhase)=>void}){
 const [context]=useState(()=>boundRuntime(props,mode)),[notice,setNotice]=useState('');
 useEffect(()=>{context.activate();return context.retire;},[context]);
 const loadSavedWork=mode==='selected'&&props.binding?async(cursor:string)=>{
  const binding=props.binding!;
  if(!props.current())throw Error('本人か会話が変わりました。');
  const page=await props.api<{ownerUserId:string;threadId:string;pending:EveRuntimePending[];executions:EveRuntimeExecution[];cursor:string|null}>('/api/eve/runtime?savedJobs=1&threadId='+encodeURIComponent(binding.threadId)+(cursor?'&cursor='+encodeURIComponent(cursor):''),{headers:{'x-sky-owner':binding.owner}});
  if(!props.current()||page.ownerUserId!==binding.owner||page.threadId!==binding.threadId||!(page.cursor===null||(typeof page.cursor==='string'&&page.cursor.length<=2048&&page.cursor!==cursor)))throw Error('本人か会話が変わりました。');
  return {references:runtimeEveRestorableWork(binding,page),cursor:page.cursor};
 }:undefined;
 const pendingKey=mode==='purpose'&&props.creation?purposeEvePendingKey(props.creation):props.binding?runtimeEvePendingKey(props.binding):'';
 return <>
  {mode==='purpose'&&props.creation&&<p>目的から文章担当を作ります。使う基盤モデル：{props.creation.modelId}。役割の保存だけでは外部Toolを実行しません。</p>}
  <EveInteractionPanel loadSavedWork={loadSavedWork} savedWork={mode==='selected'?props.savedWork:undefined} work={context.work} connected={mode==='purpose'?props.creationConnected:props.selectedConnected} pendingKey={pendingKey} preparesAgent={mode==='purpose'} onPhase={onPhase} previewRole={mode==='purpose'&&props.creation?input=>draftEvePurposeRole(input,props.creation!.modelId):undefined}
   executionNotice={mode==='purpose'?'確認した目的を役割にして自分の担当へ保存し、この実行先へ登録して下書きを作ります。出力上限256トークン。クラウド使用料0円。外部操作は含みません。':'選んだ担当と基盤モデルで下書きを作ります。出力上限256トークン。クラウド使用料0円。外部操作は含みません。'} />
  {mode==='purpose'&&context.work.cancelPreparation&&<button type="button" disabled={!['disabled','standby','review'].includes(phase)} onClick={()=>{void context.work.cancelPreparation!().then(()=>setNotice('担当登録を照合しました。保存済みの担当と成果は残ります。')).catch(error=>setNotice(error instanceof Error?error.message:'担当登録を確認できません。'));}}>残っている担当登録を確認・中止する</button>}
  {notice&&<output>{notice}</output>}
 </>;
}
export default function EveRuntimeInteraction(props:Props){
 const [mode,setMode]=useState<'purpose'|'selected'>(()=>props.creation&&props.supportsPurpose?'purpose':'selected'),[phase,setPhase]=useState<EveInteractionPhase>('disabled');
 const canChange=['disabled','standby'].includes(phase),key=mode==='purpose'&&props.creation?purposeEvePendingKey(props.creation):props.binding?runtimeEvePendingKey(props.binding):'';
 return <section aria-label="Eveの担当と実行方法"><label>担当の使い方<select disabled={!canChange} value={mode} onChange={event=>setMode(event.target.value as 'purpose'|'selected')}>
  <option value="purpose" disabled={!props.creation||!props.supportsPurpose}>目的から新しい担当を作る</option><option value="selected" disabled={!props.binding}>選んだ担当を使う</option>
 </select></label>
 {!props.supportsPurpose&&<p>この実行先は新しい担当の登録がまだ利用できません。対応する端末同期とAIの準備を確認してください。</p>}
 {key&&<BoundPanel key={mode+key} props={props} mode={mode} phase={phase} onPhase={setPhase} />}
 </section>;
}
