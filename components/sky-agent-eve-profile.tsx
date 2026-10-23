"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {SkyNotice} from './sky-feedback';
import {useSearchParams} from 'next/navigation';
import type {SkyLibraryAgent} from '@/lib/sky-agent-library';
import SkyFreeCloudPanel from './sky-free-cloud-panel';
export type SkyAgentProfileSelection={key:string;ownerUserId:string;agent:SkyLibraryAgent};
export function useSkyAgentProfileKey(){const p=useSearchParams();return p.has('agent')||p.has('agentRevision')?`${p.get('agent')??''}:${p.get('agentRevision')??''}`:'';}
export function useSkyAgentProfileRequested(){const params=useSearchParams();return params.has('agent')||params.has('agentRevision');}
export default function SkyAgentEveProfile({ownerUserId,onSelection}:{ownerUserId?:string;onSelection?:(value:SkyAgentProfileSelection|null)=>void}={}){
 const params=useSearchParams(),id=params.get('agent')??'',revision=params.get('agentRevision')??'';
 const [loaded,setLoaded]=useState<{key:string;agent?:SkyLibraryAgent;error?:string}|null>(null);
 const key=`${id}:${revision}`,requested=params.has('agent')||params.has('agentRevision');
 useEffect(()=>{
  if(!requested)return;
  const controller=new AbortController();
  void(async()=>{try{
   if(!id||!/^\d+$/.test(revision)||!Number.isSafeInteger(Number(revision)))throw Error('smisで担当を選び直してください。');
   const response=await fetch(`/api/sky/agents?id=${encodeURIComponent(id)}`,{cache:'no-store',signal:controller.signal});
   const body=await response.json() as {ownerUserId?:string;agent?:SkyLibraryAgent;error?:string};
   if(!response.ok||!body.agent)throw Error(body.error||'担当を読み込めません。');
   if(!body.ownerUserId||(ownerUserId&&body.ownerUserId!==ownerUserId))throw Error('アカウントが変わりました。画面を開き直してください。');
   if(body.agent.id!==id||body.agent.revision!==Number(revision)||!body.agent.enabled)throw Error('担当の設定が変更されたか、停止されています。smisで確認してください。');
   if(!controller.signal.aborted){setLoaded({key,agent:body.agent});onSelection?.({key,ownerUserId:body.ownerUserId,agent:body.agent});}
  }catch(e){if(!controller.signal.aborted){setLoaded({key,error:e instanceof Error?e.message:'担当を読み込めません。'});onSelection?.(null);}}})();
  return()=>{controller.abort();onSelection?.(null);};
 },[requested,id,revision,key,ownerUserId,onSelection]);
 if(!requested)return null;
 const state=loaded?.key===key?loaded:null,agent=state?.agent;
 return <section aria-label="smisから選んだ担当"><h2>{agent?.name??'選んだ担当を確認'}</h2>
 <Link href="/#sky-manage">smisで担当・LLMを管理</Link>{!state&&<output aria-live="polite">設定を読み込んでいます…</output>}
 {state?.error&&<SkyNotice message={state.error}/>}{agent&&<><p>基盤モデル：{agent.model} · 設定の版 {agent.revision}</p>
 <p>担当の役割は依頼を整理するための設定です。Toolの実行権限・支払いの承認は追加されません。</p>
 {agent.sourceTool&&<p>Tool本体の操作は別に権限を確認します。<Link href={`/os/eve?mode=tools&tool=${encodeURIComponent(agent.sourceTool)}`}>接続済みToolを使う（この担当のLLM設定は適用されません）</Link></p>}
 {agent.provider==='local-model'&&agent.source==='personal'&&!agent.sourceTool&&!('attachment' in agent&&agent.attachment)?<p>下で実行先を選び、この担当を使えます。登録だけでは仕事は始まりません。</p>:agent.provider==='pollinations'?<SkyFreeCloudPanel key={key} agent={agent}/>:<output aria-live="polite">この担当設定を使うモデルの実行先はまだ接続されていません。<Link href="/sky/devices">接続した端末の担当を選ぶ</Link>と、その端末に登録された設定でEveを使えます。</output>}</>}
 <p><Link href="/os/eve">端末の仕事・会話に戻る</Link></p></section>;
}
