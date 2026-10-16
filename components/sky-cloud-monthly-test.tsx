'use client';
import { useEffect,useState } from 'react';
import SkyPlanEstimate from './sky-plan-estimate';
type Invoice={id:string;period:string;currency:string;total_minor:number;status:string;stripe_invoice_id:string|null;hosted_invoice_url:string|null};
type Source={kind:string;id:string;provider:string;amount:number;currency:string};
type Item={source_id:string;provider_id:string;amount_minor:number;currency:string;pricing_version:string};
type Snapshot={invoices:Invoice[];sources:Source[];items:Item[];error?:string};
export default function SkyCloudMonthlyTest(){
 const [data,setData]=useState<Snapshot>({invoices:[],sources:[],items:[]});const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 async function read(){const res=await fetch('/api/sky/cloud-monthly-test/account',{cache:'no-store'});const value=await res.json() as Snapshot;if(!res.ok)throw new Error(value.error??'読み込めません。');return value;}
 useEffect(()=>{let active=true;void read().then(value=>{if(active)setData(value);}).catch(error=>{if(active)setMessage(String(error));});return()=>{active=false;};},[]);
 async function act(body:unknown){setBusy(true);setMessage('');try{const res=await fetch('/api/sky/cloud-monthly-test/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await res.json() as {error?:string};if(!res.ok)throw new Error(result.error??'結果不明です。');setData(await read());setMessage('Stripe testとSkyの状態を更新しました。');}catch(error){setMessage(String(error));}finally{setBusy(false);}}
 const style={padding:10,margin:8,borderRadius:8,border:'1px solid #64748b',cursor:'pointer'};
 const amount=(minor:number,currency:string)=>new Intl.NumberFormat('ja-JP',{style:'currency',currency}).format(currency==='JPY'?minor:minor/100);
 return <main style={{maxWidth:900,margin:'40px auto',padding:24,fontFamily:'system-ui',background:'#f8fafc',color:'#172033'}}>
 <p>Sky / Cloud使用量とStripe test</p><h1>使用量から、月次請求へ</h1><p><strong>本番課金は無効です。</strong> Stripe sandboxへの請求を作成します。保存済み使用量にはfixtureも含められるため、この画面だけでは実Cloud実行を証明しません。</p>
 <SkyPlanEstimate/>
 <button style={style} disabled={busy} onClick={()=>void read().then(setData).catch(error=>setMessage(String(error)))}>最新状態を再取得</button><output>{busy?'処理中…':message}</output>
 <h2>1. 確定済みCloud使用量</h2>{data.sources.length===0&&<p>使用量はまだありません。既存のAgent実行・予算承認・最終usage照合を完了してください。</p>}
 {data.sources.map(source=><article key={source.id}><p>{source.provider} · {amount(source.amount,source.currency)} · {source.id}</p><button style={style} disabled={busy} onClick={()=>void act({action:'import',kind:source.kind,id:source.id})}>月次明細へ取り込む</button></article>)}
 <h2>2. 月次請求</h2>{data.invoices.map(invoice=><article key={invoice.id} style={{border:'1px solid #cbd5e1',padding:16,marginBottom:16}}><h3>{invoice.period} · {amount(invoice.total_minor,invoice.currency)}</h3><p>状態：{invoice.status} · Stripe ID：{invoice.stripe_invoice_id??'未作成'}</p>
 {['draft','submitting'].includes(invoice.status)&&<button style={style} disabled={busy} onClick={()=>void act({action:'close',id:invoice.id,expectedTotal:invoice.total_minor})}>表示額でStripeテスト請求を作成</button>}
 {invoice.stripe_invoice_id&&<button style={style} disabled={busy} onClick={()=>void act({action:'reconcile',id:invoice.id})}>Stripeへ再照会</button>}
 {invoice.hosted_invoice_url&&<a href={invoice.hosted_invoice_url} target="_blank" rel="noreferrer">Stripeのテスト請求書を開く</a>}
 </article>)}
 <h2>使用明細</h2><ul>{data.items.map(item=><li key={item.source_id}>{item.provider_id} · {amount(item.amount_minor,item.currency)} · 価格版 {item.pricing_version}</li>)}</ul>
 <p>今月の締めもテストとして操作できます。Stripeには月次合計を送り、個別usageと原稿はSky側に保持します。</p>
 </main>;
}
