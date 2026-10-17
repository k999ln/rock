import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {openMonthlySandboxDatabase} from './sky-monthly-sandbox-db.mjs';
import {skyRecurringUsage} from '../lib/sky-recurring-usage.ts';
import {skyRecurringSandbox} from '../lib/sky-recurring-sandbox.ts';
import {monthlyStripeTest,readMonthlyStripeConfig} from '../lib/sky-cloud-monthly-stripe.ts';
/** Only sandbox accounts can instantiate this collector. No HTTP enrollment/payment mutation endpoint. */
export async function startRecurringSandbox({db,env,clock=Date.now,interval=30000,port=5225,report=()=>({}),onEvent=()=>{},eventHistory=[]}){
 const service=skyRecurringSandbox(db,env),verifier=monthlyStripeTest(readMonthlyStripeConfig(env));
 const events=eventHistory;let busy=false;
 const cycle=async()=>{if(busy)return;busy=true;try{await service.tick(clock());}finally{busy=false;}};
 const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const date=value=>new Date(value).toISOString().slice(0,10);
 const label=status=>({active:'利用可能',collecting:'入金照合中',past_due:'未払い・新規有料利用停止',paid:'支払済み',open:'未払い',cancelled:'解約済み',disputed:'確認が必要'})[status]??status;
 const server=createServer(async(req,res)=>{
  if(req.method==='GET'){
   const contracts=db.sqlite.prepare('SELECT owner_id,status,period_start,period_end FROM sky_recurring_contracts').all();
   const usage=await Promise.all(contracts.map(c=>skyRecurringUsage(db,c.owner_id,clock())));
   const money=value=>'$'+(value/100).toFixed(2);
   const charges=db.sqlite.prepare('SELECT status,period_start,period_end FROM sky_recurring_charges ORDER BY period_start').all();
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"});
   res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sky 月次自動請求 Sandbox</title><body style="font:18px system-ui;background:#101827;color:#eef5ff;max-width:960px;margin:48px auto;padding:24px"><p>SKY · SANDBOX ONLY</p><h1>月額 $140 · Agent利用枠 $100</h1><p>月締め後の自動決済。未払いで新規予約・送信を停止し、入金照合後に復旧。</p><p>本番課金なし。検証用時計と合成Agent使用量を使用しています。</p><h2>契約</h2><ul>${contracts.map(c=>`<li>${escape(label(c.status))} · ${date(c.period_start)}〜${date(c.period_end)}（UTC）</li>`).join('')}</ul><h2>Agent利用枠</h2><ul>${usage.map(u=>`<li>確定 ${money(u.settledMinor)} ／ 予約中 ${money(u.reservedMinor)} ／ 残り ${money(u.remainingMinor)}${u.reason==='quota_exhausted'?' · 上限到達・新規有料利用停止':''}</li>`).join('')}</ul><h2>月次請求（各 $140）</h2><ul>${charges.map(c=>`<li>${date(c.period_start)}〜${date(c.period_end)} · $140 · ${escape(label(c.status))}</li>`).join('')}</ul><h2>受入結果</h2><p>${report().status==='passed'?'検証合格':escape(report().status??'待機中')}</p><ul>${(report().checks??[]).map(check=>`<li style="margin:12px 0">✓ ${escape(check)}</li>`).join('')}</ul><p>署名検証済み通知：${events.length}件</p><p>実Cloud実行、本番契約・税・与信は未受入。</p></body></html>`);return;
  }
  if(req.method!=='POST'){res.writeHead(405);res.end();return;}
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
