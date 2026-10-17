'use client';
import {useState} from 'react';
export default function SkyFreeCloudAccount(){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false);
 async function check(enroll=false){setBusy(true);try{const r=await fetch('/api/llm/free-cloud/account',enroll?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:'synthetic-free-only-v1'})}:{cache:'no-store'});const v=await r.json() as {accountId:string;enabled:boolean;plan:{reason:string};contractLabel:string;error?:string};setText(r.ok?`アカウント: ${v.accountId} / 接続: ${v.enabled?'有効':'未設定'} / プラン: ${v.plan.reason} / ${v.contractLabel}`:v.error||'接続を確認できません。');}catch{setText('接続を確認できませんでした。');}finally{setBusy(false);}}
 return <section aria-label="実アカウント検証"><h2>実アカウント・無料Cloud検証</h2><p>本人ログインで実Cloudへ接続します。検証契約は合成・1時間限定です。月額140ドルの購入・請求は発生しません。</p><button disabled={busy} onClick={()=>void check()}>本人接続を確認</button><button disabled={busy} onClick={()=>void check(true)}>請求なしの検証契約に同意して開始</button><output>{text}</output></section>;
}
