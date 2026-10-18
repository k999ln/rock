'use client';
import {useState} from 'react';
type Result={trial:{phase:string;status?:string;oldContractPreserved?:boolean;charges?:{invoiceId:string;status:string;monthlyMinor:number}[]};plan:{reason:string;settledMinor:number;remainingMinor:number;periodStart:number;periodEnd:number};events:{id:string;type:string}[]};
export default function SkyHostedMonthly(){
 const [result,setResult]=useState<Result|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function run(action?:string){setBusy(true);setError('');try{const r=await fetch('/api/llm/monthly-sandbox',action?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,consent:'sky140-hosted-sandbox-v1'})}:{cache:'no-store'});const value=await r.json() as Result & {error?:string};if(!r.ok)throw Error(value.error);setResult(value);}catch(e){setError(e instanceof Error?e.message:'接続失敗');}finally{setBusy(false);}}
 const phase=result?.trial.phase;
 return <section aria-label="月次Sandbox契約"><h2>月額 $140 · 利用枠 $100</h2><p>本人アカウントのStripe Sandbox契約。本番課金はありません。旧契約と保存済みデータは保持します。</p><p>上限検証には合成100ドル、月締めには検証用時計を使います。無料Cloudの実利用料は0ドルです。</p>
 <button disabled={busy} onClick={()=>void run()}>月次契約を確認</button>
 {phase==='not_migrated'&&<button disabled={busy} onClick={()=>void run('migrate')}>同意して月次Sandboxへ切り替える</button>}
 {phase==='migrating'&&<button disabled={busy} onClick={()=>void run('migrate')}>契約移行を再開</button>}
 {(phase==='active'||phase==='restored')&&<button disabled={busy} onClick={()=>void run('cap')}>合成100ドルで上限停止を検証</button>}
 {phase==='capped'&&<button disabled={busy} onClick={()=>void run('close-month')}>テスト月締め・支払失敗を検証</button>}
 {phase==='unpaid'&&<button disabled={busy} onClick={()=>void run('pay')}>テスト入金して復旧を検証</button>}
 {error&&<p role="alert">{error}</p>}
 {result&&<><p>検証段階: {result.trial.phase} ／ 契約: {result.trial.status??'未移行'}</p><p>利用状態: {result.plan.reason} ／ 使用額（合成検証を含む） ${(result.plan.settledMinor/100).toFixed(2)} ／ 残り ${(result.plan.remainingMinor/100).toFixed(2)}</p><p>対象期間: {new Date(result.plan.periodStart).toISOString().slice(0,10)}〜{new Date(result.plan.periodEnd).toISOString().slice(0,10)} UTC</p>{result.trial.oldContractPreserved&&<p>旧1時間契約の移行前データを保持済み</p>}<ul>{result.trial.charges?.map(c=><li key={c.invoiceId}>$140 · {c.status} · {c.invoiceId}</li>)}</ul><p>署名確認済み通知: {result.events.length}件 {result.events.map(e=>e.type).join(' / ')}</p></>}
 <p>入金だけで同月の消費枠は戻りません。次月更新後に新しい100ドル枠になります。</p></section>;
}
