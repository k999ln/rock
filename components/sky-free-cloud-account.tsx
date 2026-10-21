'use client';
import {useState} from 'react';
export default function SkyFreeCloudAccount(){
 const [text,setText]=useState(''),[busy,setBusy]=useState(false),[setupAvailable,setSetupAvailable]=useState(false);
 async function check(enroll=false){setBusy(true);try{const r=await fetch('/api/llm/free-cloud/account',enroll?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({consent:'synthetic-free-only-v1'})}:{cache:'no-store'});const v=await r.json() as {accountId:string;enabled:boolean;setupAvailable:boolean;plan:{reason:string;remainingMinor?:number};contractLabel:string;error?:string};setSetupAvailable(r.ok&&v.setupAvailable===true);setText(r.ok?`アカウント: ${v.accountId} / 接続: ${v.enabled?'有効':'未設定'} / プラン: ${v.plan.reason} / ${v.contractLabel}`:v.error||'接続を確認できません。');}catch{setText('接続を確認できませんでした。');}finally{setBusy(false);}}
 return <section aria-label="実アカウント検証"><h2>実アカウント・無料Cloud検証</h2><p>本人ログインで実Cloudへ接続します。接続先の契約と利用枠を確認します。月額140ドル・利用枠100ドルのSandbox契約では、枠切れ・未払い時は無料Cloudも停止します。本番課金は行いません。</p><button disabled={busy} onClick={()=>void check()}>本人接続を確認</button>{setupAvailable&&<button disabled={busy} onClick={()=>void check(true)}>補助の1時間合成テストを開始（月次契約とは別）</button>}<output>{text}</output></section>;
}
