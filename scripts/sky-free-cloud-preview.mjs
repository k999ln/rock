import {createServer} from 'node:http';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {build} from 'esbuild';
import {openMonthlySandboxDatabase} from './sky-monthly-sandbox-db.mjs';
import {selectSkyModel} from '../lib/sky-model-selection.ts';
import {freeCloudTextHttp} from '../lib/sky-free-cloud-http.ts';
import {skyRecurringUsage} from '../lib/sky-recurring-usage.ts';

// Dedicated local harness: synthetic contract, real anonymous inference, no Stripe keys or payments.
const port=5227,origin=`http://127.0.0.1:${port}`,owner='synthetic-free-cloud-owner';
const directory=new URL('../work/sky-free-cloud-preview/',import.meta.url);mkdirSync(directory,{recursive:true});
const db=openMonthlySandboxDatabase(new URL('state.sqlite',directory).pathname),now=Date.now();
db.sqlite.prepare(`INSERT INTO sky_recurring_contracts(id,owner_id,stripe_account_id,customer_id,payment_method_id,consent_version,credit_minor,period_start,period_end,status,access_until,created_at,updated_at) VALUES('fixture',?,'acct_fixture','cus_fixture','pm_fixture','synthetic-free-only',14000,?,?,'active',?,?,?) ON CONFLICT(owner_id) DO UPDATE SET period_start=excluded.period_start,period_end=excluded.period_end,access_until=excluded.access_until,status='active'`).run(owner,now-1000,now+3600000,now+3600000,now,now);
const runtime={SKY_FREE_CLOUD_ENABLED:'true',SKY_FREE_CLOUD_OWNER_ID:owner},token=randomBytes(32).toString('hex');
const output=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Panel from './components/sky-free-cloud-panel';createRoot(document.getElementById('app')).render(<Panel/>);",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'esm',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const javascript=output.outputFiles[0].text;
let posts=0;
try{posts=JSON.parse(readFileSync(new URL('network-count.json',directory),'utf8')).realPosts;}catch{/* First run has no network evidence yet. */}
const fetcher=async(url,init)=>{if(init?.method==='POST'){posts++;writeFileSync(new URL('network-count.json',directory),JSON.stringify({realPosts:posts}));}return fetch(url,init);};
const server=createServer(async(req,res)=>{
 try{
  if(req.headers.host!==`127.0.0.1:${port}`){res.writeHead(403);res.end();return;}
  const headers={'Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"};
  if(req.method==='GET'&&req.url==='/') {res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Set-Cookie':`sky_free_preview=${token}; HttpOnly; SameSite=Strict; Path=/`});res.end(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sky 無料Cloud 検証</title><style>body{font:17px system-ui;background:#101827;color:#eef5ff;max-width:900px;margin:48px auto;padding:24px}label{display:block;margin:24px 0}textarea{display:block;width:100%;box-sizing:border-box;padding:16px;font:inherit}button{font:inherit;padding:12px 18px;margin:8px 12px 8px 0}output{display:block;overflow-wrap:anywhere;color:#8ee8c4}p{line-height:1.7}</style><p>開発用Mac · 合成Sandbox契約 / 実Cloud応答。Stripe接続なし。</p><div id="app"></div><script type="module" src="/app.js"></script></html>`);return;}
  if(req.method==='GET'&&req.url==='/app.js'){res.writeHead(200,{...headers,'Content-Type':'text/javascript'});res.end(javascript);return;}
  if(req.method!=='POST'||req.headers.origin!==origin||!req.headers.cookie?.split('; ').includes(`sky_free_preview=${token}`)){res.writeHead(403);res.end();return;}
  let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>50000){res.writeHead(413);res.end();return;}}
  let response;
  if(req.url==='/api/llm/select'){
   const value=JSON.parse(raw);
   if(typeof value.prompt!=='string'||value.prompt.length>12000)throw Error('INVALID_INPUT');
   const result=await selectSkyModel({db,owner,prompt:value.prompt,allowCloud:value.allowCloud===true,runtime,fetcher});
   response=Response.json(result.selection?result:{...result,error:'利用可能な無料モデルがありません。'},{status:result.selection?200:409});
  }else if(req.url==='/api/llm/free-cloud'){
   response=await freeCloudTextHttp(new Request(origin+req.url,{method:'POST',body:raw}),db,owner,runtime,fetcher);
   const result=await response.clone().json();
   writeFileSync(new URL('last-result.json',directory),JSON.stringify({at:new Date().toISOString(),httpStatus:response.status,result,plan:await skyRecurringUsage(db,owner),realPosts:posts,contract:'synthetic',stripeRequests:0,productionBilling:false},null,2));
  }else{res.writeHead(404);res.end();return;}
  res.writeHead(response.status,{...headers,'Content-Type':'application/json'});res.end(await response.text());
 }catch{res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'ローカル検証要求を処理できませんでした。'}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Free Cloud preview: ${origin}`));
