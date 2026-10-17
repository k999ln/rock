'use client';
import { useRef, useState } from 'react';

export default function SkyFreeCloudPanel() {
  const [prompt,setPrompt]=useState('合成テストです。2 + 3 の答えを日本語で一文だけ返してください。');
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [submitted,setSubmitted]=useState(false);
  const [selection,setSelection]=useState('');
  const [answer,setAnswer]=useState('');
  const [usage,setUsage]=useState('');
  const [error,setError]=useState('');
  const lock=useRef(false), requestId=useRef('');
  async function run(){
    if(lock.current||!consent||!prompt.trim())return;
    lock.current=true;setBusy(true);setError('');
    requestId.current ||= crypto.randomUUID();setSubmitted(true);
    try{
      const route=await fetch('/api/llm/select',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,allowCloud:true}),signal:AbortSignal.timeout(12000)});
      const chosen=await route.json() as {selection?:{provider:string;model:string;reason:string};error?:string};
      if(!route.ok||!chosen.selection)throw new Error(chosen.error||'モデルを選択できません。');
      setSelection(`${chosen.selection.provider} / ${chosen.selection.model} — ${chosen.selection.reason}`);
      if(chosen.selection.provider!=='pollinations')throw new Error('この検証画面は無料Cloud専用です。ローカルは会話画面から実行してください。');
      const response=await fetch('/api/llm/free-cloud',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:requestId.current,prompt,model:chosen.selection.model,consent}),signal:AbortSignal.timeout(65000)});
      const result=await response.json() as {text?:string;reportedModel?:string;providerResponseId?:string;usage?:{inputTokens:number;outputTokens:number;chargeMinor:number};error?:string};
      if(!response.ok||!result.text||!result.usage)throw new Error(result.error||'応答・使用量を確認できません。');
      setAnswer(result.text);setUsage(`実モデル: ${result.reportedModel} / 入力 ${result.usage.inputTokens}・出力 ${result.usage.outputTokens} tokens / $${(result.usage.chargeMinor/100).toFixed(2)} / 参照 ${result.providerResponseId}`);
    }catch(reason){setError(reason instanceof Error?reason.message:'実行結果を確認できません。同じ依頼IDを保持しています。');}
    finally{lock.current=false;setBusy(false);}
  }
  return <section aria-label="無料Cloud実行">
    <h1>Sky · 無料Cloudの自動選択</h1>
    <p>接続先のモデル一覧から自動で選び、文章と実際のトークン使用量を確認します。本番課金・有料切替なし。</p>
    <label>依頼文<textarea rows={4} maxLength={12000} value={prompt} disabled={busy||submitted} onChange={e=>setPrompt(e.target.value)} /></label>
    <label><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>依頼文をPollinationsの匿名無料Cloudへ送信する。秘密情報は入力しない。</label>
    <p>無料枠には待機制限があります。402/429では停止し、支払いや自動再送はしません。</p>
    <button type="button" disabled={busy||!consent} onClick={()=>{void run();}}>{busy?'自動選択・実行中…':'自動選択して実行'}</button>
    <button type="button" disabled={busy} onClick={()=>{requestId.current='';setSubmitted(false);setAnswer('');setUsage('');setSelection('');setError('');}}>新しい依頼</button>
    {selection&&<p>選択: {selection}</p>}
    {error&&<p role="alert">{error}</p>}
    {answer&&<><h2>Cloudの実応答</h2><p>{answer}</p><output>{usage}</output></>}
  </section>;
}
