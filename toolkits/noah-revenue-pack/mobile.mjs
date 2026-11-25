import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { html, css, js } from './mobile-page.mjs';

const hash=value=>createHash('sha256').update(value).digest();
const matches=(value,digest)=>typeof value==='string'&&value.length<=128&&timingSafeEqual(hash(value),digest);
export function createMobileServer(runtime,{port=3138,example,fetcher,clock=Date.now}={}){
  const pairing=randomBytes(32).toString('hex'),pairHash=hash(pairing),expires=clock()+300000;
  let paired=false,sessionHash=null,sessionExpires=0,active=null,lastError='',attempts=0,origin='',running=Promise.resolve();
  const server=createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    function send(status,value,type='application/json'){res.writeHead(status,{'Content-Type':type});res.end(type==='application/json'?JSON.stringify(value):value);}
    try{
      if(req.headers.host!==new URL(origin).host)return send(403,{error:'接続先が一致しません。'});
      const path=new URL(req.url,origin).pathname;
      if(req.method==='GET'&&['/','/app.js','/style.css'].includes(path))return send(200,path==='/'?html:path==='/app.js'?js:css,path==='/'?'text/html; charset=utf-8':path==='/app.js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
      if(!['GET','POST'].includes(req.method))return send(405,{error:'対応していない操作です。'});
      let body;
      if(req.method==='POST'){
        if(req.headers.origin!==origin||req.headers['content-type']!=='application/json')return send(403,{error:'操作元が一致しません。'});
        const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>16384)return send(413,{error:'入力が長すぎます。'});chunks.push(c);}body=JSON.parse(Buffer.concat(chunks).toString());
      }
      if(path==='/api/pair'&&req.method==='POST'){
        if(paired||clock()>=expires||++attempts>10||!matches(body?.token,pairHash))return send(403,{error:'接続キーが無効または期限切れです。Macから接続し直してください。'});
        paired=true;const token=randomBytes(32).toString('hex');sessionHash=hash(token);sessionExpires=clock()+86400000;
        res.setHeader('Set-Cookie',`noah_revenue=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);return send(200,{connected:true});
      }
      const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('noah_revenue='))?.slice(13);
      if(!sessionHash||clock()>=sessionExpires||!matches(cookie,sessionHash))return send(401,{error:'Macからこの携帯を接続してください。'});
      if(req.method==='GET'&&path==='/api/status'){
        const jobs=(await runtime.list()).map(j=>({id:j.id,title:j.title,state:j.freeCloud?.state,text:j.freeCloud?.text,chargeMinor:j.freeCloud?.chargeMinor,error:j.freeCloud?.error}));
        return send(200,{active:!!active,error:lastError,stopped:existsSync(join(runtime.root,'STOP')),jobs});
      }
      if(req.method==='GET'&&path==='/api/example')return send(200,{brief:example.brief});
      if(req.method==='POST'&&path==='/api/stop'){runtime.stop();return send(200,{stopped:true});}
      if(req.method==='POST'&&path==='/api/run'){
        if(!body||Object.keys(body).some(k=>!['id','brief','consent'].includes(k))||!/^[a-zA-Z0-9-]{1,64}$/.test(body.id)||typeof body.brief!=='string'||!body.brief.trim()||body.brief.length>3000||body.consent!=='anonymous-free-direct-v1')return send(400,{error:'依頼と無料クラウド送信への同意を確認してください。'});
        const requestKey=JSON.stringify(body);
        if(active)return send(active.key===requestKey?202:409,{error:active.key===requestKey?undefined:'別の依頼を実行中です。',id:active.id});
        await runtime.checkStopped();
        if(active)return send(active.key===requestKey?202:409,{id:active.id,error:'実行中です。'});
        // Preserve request before acknowledging. Same ID never replaces an earlier request.
        const file=join(runtime.root,`mobile-${body.id}.json`);
        try{writeFileSync(file,requestKey,{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST'||readFileSync(file,'utf8')!==requestKey)throw Error('同じ依頼IDの内容が変わっています。');}
        active={id:body.id,key:requestKey};lastError='';
        running=runtime.run(body,fetcher).catch(error=>{lastError=error.message;}).finally(()=>{active=null;});
        return send(202,{id:body.id});
      }
      return send(404,{error:'ページがありません。'});
    }catch(error){return send(400,{error:error.message||'操作を確認できません。'});}
  });
  return {server,start:()=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{origin=`http://127.0.0.1:${server.address().port}`;resolve({origin,pairUrl:`${origin}/#pair=${pairing}`});});}),close:async()=>{runtime.stop();await new Promise(resolve=>server.close(resolve));await running;}};
}
