import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {selectSkyModel} from '../lib/sky-model-selection.ts';
import {freeCloudTextHttp} from '../lib/sky-free-cloud-http.ts';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {openMonthlySandboxDatabase} from './sky-monthly-sandbox-db.mjs';
import {skyRecurringUsage} from '../lib/sky-recurring-usage.ts';
import {skyRecurringSandbox} from '../lib/sky-recurring-sandbox.ts';
import {monthlyStripeTest,readMonthlyStripeConfig} from '../lib/sky-cloud-monthly-stripe.ts';
/** Only sandbox accounts can instantiate this collector. No HTTP enrollment/payment mutation endpoint. */
export async function startRecurringSandbox({db,env,clock=Date.now,interval=30000,port=5225,report=()=>({}),onEvent=()=>{},eventHistory=[],freeCloud=null}){
 const service=skyRecurringSandbox(db,env),verifier=monthlyStripeTest(readMonthlyStripeConfig(env));
 const origin=`http://127.0.0.1:${port}`,token=randomBytes(32).toString('hex');
 let javascript='';
 if(freeCloud){const built=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Panel from './components/sky-free-cloud-panel';createRoot(document.getElementById('cloud')).render(<Panel/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});javascript=built.outputFiles[0].text;}
 const events=eventHistory;let busy=false;
 const cycle=async()=>{if(busy)return;busy=true;try{await service.tick(clock());}finally{busy=false;}};
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const date=value=>new Date(value).toISOString().slice(0,10);
 const label=status=>({active:'利用可能',collecting:'入金照合中',past_due:'未払い・新規Cloud利用停止',paid:'支払済み',open:'未払い',cancelled:'解約済み',disputed:'確認が必要'})[status]??status;
 const server=createServer(async(req,res)=>{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  if(freeCloud&&req.method==='GET'&&req.url==='/app.js'){res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(javascript);return;}
  if(freeCloud&&req.method==='POST'&&['/api/llm/select','/api/llm/free-cloud'].includes(req.url)){
   if(req.headers.origin!==origin||!req.headers.cookie?.split('; ').includes(`sky_monthly_preview=${token}`)){res.writeHead(403);res.end();return;}
   try{let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>50000){res.writeHead(413);res.end();return;}}
    let response;
    if(req.url==='/api/llm/select'){const body=JSON.parse(raw);if(typeof body.prompt!=='string'||body.prompt.length>12000)throw Error('input');const result=await selectSkyModel({db,owner:freeCloud.owner,prompt:body.prompt,allowCloud:body.allowCloud===true,runtime:freeCloud.runtime,fetcher:freeCloud.fetcher,clock});response=Response.json({...result,...(!result.selection?{error:`Skyプラン: ${result.cloudStatus}`}:{})},{status:result.selection?200:409});}
    else response=await freeCloudTextHttp(new Request(origin+req.url,{method:'POST',body:raw}),db,freeCloud.owner,freeCloud.runtime,freeCloud.fetcher,clock);
    res.writeHead(response.status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(await response.text());
   }catch{res.writeHead(400);res.end('Invalid sandbox request');}return;
  }
  if(req.method==='GET'){
   const contracts=db.sqlite.prepare('SELECT owner_id,status,period_start,period_end FROM sky_recurring_contracts').all();
   const usage=await Promise.all(contracts.map(c=>skyRecurringUsage(db,c.owner_id,clock())));
   const money=value=>'$'+(value/100).toFixed(2);
   const charges=db.sqlite.prepare('SELECT status,period_start,period_end FROM sky_recurring_charges ORDER BY period_start').all();
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Set-Cookie':`sky_monthly_preview=${token}; HttpOnly; SameSite=Strict; Path=/`,'Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
   res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sky 月次自動請求 Sandbox</title><body style="font:18px system-ui;background:#101827;color:#eef5ff;max-width:960px;margin:48px auto;padding:24px"><p>SKY · SANDBOX ONLY</p><h1>月額 $140 · Agent利用枠 $100</h1><p>月締め後の自動決済。未払いで新規予約・送信を停止し、入金照合後に復旧。</p><p>本番課金なし。検証用時計と合成Agent使用量を使用しています。</p><h2>契約</h2><ul>${contracts.map(c=>`<li>${escape(label(c.status))} · ${date(c.period_start)}〜${date(c.period_end)}（UTC）</li>`).join('')}</ul><h2>Agent利用枠</h2><ul>${usage.map(u=>`<li>確定 ${money(u.settledMinor)} ／ 予約中 ${money(u.reservedMinor)} ／ 残り ${money(u.remainingMinor)}${u.reason==='quota_exhausted'?' · 上限到達・新規Cloud利用停止':''}</li>`).join('')}</ul><h2>月次請求（各 $140）</h2><ul>${charges.map(c=>`<li>${date(c.period_start)}〜${date(c.period_end)} · $140 · ${escape(label(c.status))}</li>`).join('')}</ul><h2>受入結果</h2><p>${report().status==='passed'?'検証合格':escape(report().status??'待機中')}</p><ul>${(report().checks??[]).map(check=>`<li style="margin:12px 0">✓ ${escape(check)}</li>`).join('')}</ul><p>署名検証済み通知：${events.length}件</p>${freeCloud?'<p>独立したSandboxテスト利用者。1時間の合成契約は使わず、Stripe Sandboxの月次契約を定期照合。下の依頼は実Cloudへ無料で送信します。枠切れと未払いは無料Cloudも停止します。</p><div id="cloud"></div><script type="module" src="/app.js"></script>':'<p>実Cloud実行は未受入。</p>'}<p>本番契約・税・与信は未受入。</p></body></html>`);return;
  }
  if(req.method!=='POST'||req.url!=='/webhook'){res.writeHead(405);res.end();return;}
  let raw;
  try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>200000)throw Error('size');chunks.push(chunk);}raw=Buffer.concat(chunks).toString('utf8');await verifier.verifyEvent(raw,req.headers['stripe-signature']??null);}catch{res.writeHead(400);res.end('Invalid signature/body');return;}
  try{await service.webhook(raw,req.headers['stripe-signature']??null,clock());const e=JSON.parse(raw);if(!events.some(x=>x.id===e.id)){const verified={id:e.id,type:e.type,objectId:e.data.object.id};events.push(verified);onEvent(verified);}res.writeHead(200);res.end('Verified');}catch{res.writeHead(503);res.end('Reconciliation required');}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const timer=setInterval(()=>void cycle().catch(()=>{}),interval);
 return {service,events,cycle,async close(){clearInterval(timer);await new Promise(resolve=>server.close(resolve));while(busy)await new Promise(r=>setTimeout(r,20));}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.SKY_RECURRING_SANDBOX!=='1')throw Error('Explicit sandbox opt-in required');
 const env=JSON.parse(readFileSync(process.env.SKY_CLOUD_MONTHLY_CONFIG_FILE,'utf8'));
 const db=openMonthlySandboxDatabase(process.env.SKY_RECURRING_DB||'work/sky-recurring-sandbox/state.sqlite');
 const app=await startRecurringSandbox({db,env});console.log('Sandbox scheduler: http://127.0.0.1:5225/');
 for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>void app.close().then(()=>{db.close();process.exit(0);}));
}
