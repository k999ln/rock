'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function SkyFreeCloudPanel() {
  const [prompt,setPrompt]=useState('合成テストです。2 + 3 の答えを日本語で一文だけ返してください。');
  const [consent,setConsent]=useState(false);
  const [autoContinue,setAutoContinue]=useState(true);
  const [busy,setBusy]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [selection,setSelection]=useState('');
  const [answer,setAnswer]=useState('');
  const [usage,setUsage]=useState('');
  const [error,setError]=useState('');
  const [retryAt,setRetryAt]=useState(0),[deadline,setDeadline]=useState(0),[now,setNow]=useState(()=>Date.now());
  const [attempts,setAttempts]=useState(0),[jobId,setJobId]=useState('');
  const lock=useRef(false), requestId=useRef(''), pinnedModel=useRef('');
  const run=useCallback(async()=>{
    if(lock.current||!consent||!prompt.trim())return;
    lock.current=true;setBusy(true);setError('');setRetryAt(0);
    requestId.current ||= crypto.randomUUID();setJobId(requestId.current);setSubmitted(true);
    try{
      if(!pinnedModel.current){
        const route=await fetch('/api/llm/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,allowCloud:true}),signal:AbortSignal.timeout(12000)});
        const chosen=await route.json() as {selection?:{provider:string;model:string;reason:string};error?:string};
        if(!route.ok||!chosen.selection)throw new Error(chosen.error||'モデルを選択できません。');
        setSelection(`${chosen.selection.provider} / ${chosen.selection.model} — ${chosen.selection.reason}`);
        if(chosen.selection.provider!=='pollinations')throw new Error('この検証画面は無料Cloud専用です。');
        pinnedModel.current=chosen.selection.model;
      }
      const response=await fetch('/api/llm/free-cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,prompt,model:pinnedModel.current,consent,autoContinue}),signal:AbortSignal.timeout(185000)});
      const result=await response.json() as {state?:string;retryAt?:number;retryDeadline?:number;attempts?:number;text?:string;reportedModel?:string;providerResponseId?:string;usage?:{inputTokens:number;outputTokens:number;chargeMinor:number};error?:string};
      setAttempts(result.attempts??0);
      if(response.status===202&&result.state==='waiting'&&Number.isSafeInteger(result.retryAt)&&Number.isSafeInteger(result.retryDeadline)){
        setNow(Date.now());setDeadline(result.retryDeadline!);setRetryAt(result.retryAt!);return;
      }
      if(!response.ok||!result.text||!result.usage)throw new Error(result.error||'応答・使用量を確認できません。');
      setAnswer(result.text);setUsage(`実モデル: ${result.reportedModel} / 入力 ${result.usage.inputTokens}・出力 ${result.usage.outputTokens} tokens / $${(result.usage.chargeMinor/100).toFixed(2)} / 参照 ${result.providerResponseId}`);
    }catch(reason){setError(reason instanceof Error?reason.message:'実行結果を確認できません。同じ依頼IDを保持しています。');}
    finally{lock.current=false;setBusy(false);}
  },[autoContinue,consent,prompt]);
  useEffect(()=>{
    if(!retryAt)return;
    const timer=setInterval(()=>{
      const current=Date.now();setNow(current);
      if(!autoContinue||!consent||busy||lock.current)return;
      if(current>=deadline){setAutoContinue(false);setError('自動続行の10分上限に達しました。同じ依頼を自動再送しません。');return;}
      if(current>=retryAt)void run();
    },1000);
    return()=>clearInterval(timer);
  },[retryAt,deadline,autoContinue,consent,busy,run]);
  return <section aria-label="無料Cloud実行">
    <h1>Sky · 無料Cloudの自動選択</h1>
    <p>接続先のモデル一覧から自動で選び、文章と実際のトークン使用量を確認します。本番課金・有料切替なし。</p>
    <label>依頼文<textarea rows={4} maxLength={12000} value={prompt} disabled={busy||submitted} onChange={e=>setPrompt(e.target.value)} /></label>
    <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>依頼文をPollinationsの匿名無料Cloudへ送信する。秘密情報は入力しない。</label>
    <label><input type="checkbox" checked={autoContinue} disabled={busy} onChange={e=>setAutoContinue(e.target.checked)}/>無料枠の待機後、同じ依頼を自動で続行する</label>
    <p>生成前の待機拒否が確認できた場合のみ続行します。最大5回・10分。結果不明では再送しません。画面を閉じる・再読み込みすると自動続行は停止します。</p>
    {retryAt>0&&<output>無料枠まであと {Math.max(0,Math.ceil((retryAt-now)/1000))} 秒 · {autoContinue&&consent?'自動続行を待機中':'自動続行は停止中'}</output>}
    <button type="button" disabled={busy||!consent||(retryAt>0&&now<retryAt)} onClick={()=>{void run();}}>{busy?'自動選択・実行中…':answer?'保存済みの結果を確認':'自動選択して実行'}</button>
    <button type="button" disabled={busy||retryAt>0} onClick={()=>{requestId.current='';pinnedModel.current='';setJobId('');setAttempts(0);setSubmitted(false);setAnswer('');setUsage('');setSelection('');setError('');}}>新しい依頼</button>
    {jobId&&<p>依頼ID: {jobId} · Provider送信試行: {attempts} 回（待機拒否を含む）</p>}
    {selection&&<p>選択: {selection}</p>}
    {error&&<p role="alert">{error}</p>}
    {answer&&<><h2>Cloudの実応答</h2><p>{answer}</p><output>{usage}</output></>}
  </section>;
}
