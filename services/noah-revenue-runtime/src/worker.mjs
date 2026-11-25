import license from './license.json' with {type:'json'};
import {html,css,js} from '../../../toolkits/noah-revenue-pack/mobile-page.mjs';
import example from '../../../toolkits/noah-revenue-pack/request.example.json' with {type:'json'};
import {revenueDigest} from '../../../lib/noah-revenue-pack.ts';
import {RevenueOperation,HttpError,exact,SESSION_SECONDS} from './operation.mjs';
const COOKIE='__Host-noah-revenue';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY','Strict-Transport-Security':'max-age=31536000','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"};
const json=(data,status=200,extra={})=>Response.json(data,{status,headers:{...headers,...extra}});
const cookie=(token,age=SESSION_SECONDS)=>`${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const page=html.replace('</footer>', ' · <a href="/license">Agent出典・MITライセンス</a></footer>').replace('本人Macで実行管理・無料クラウドで文章生成。登録、eSIM、支払情報は不要です。','クラウドで実行・保存。Macを閉じても携帯だけで使えます。eSIMや支払情報は不要です。').replace('Macに成果を保存します','本人用クラウドに成果を保存します').replace('この画面を閉じてもMacが起動している間は処理を続けます。','この画面やMacを閉じても処理を続けます。1日4回・12担当まで。無料枠不足時は待機・停止します。');
const script=js.replace('pending=null,busy=false','pending=null,busy=false,generation=0').replace("connected=true;active=d.active;","connected=true;active=d.active;generation=d.generation;if(pending&&pending.generation!==generation){pending=null;}").replace("再開にはMacで状態を確認してください。","新しい依頼はこの画面から開始できます。").replace("consent:'anonymous-free-direct-v1'","consent:'anonymous-free-direct-v1',generation").replace("setInterval(refresh,5000)","setInterval(()=>{if(!document.hidden)refresh();},15000)");
async function body(request){
  if(!request.headers.get('content-type')?.startsWith('application/json'))throw new HttpError(415,'JSONで送信してください。');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'入力がありません。');let n=0,text='';const decoder=new TextDecoder();
  while(true){const c=await reader.read();if(c.done)break;n+=c.value.byteLength;if(n>16384){await reader.cancel();throw new HttpError(413,'入力が大きすぎます。');}text+=decoder.decode(c.value,{stream:true});}
  try{return JSON.parse(text+decoder.decode());}catch{throw new HttpError(400,'入力を確認してください。');}
}
async function dispatch(env,action,input={},sessionHash=''){
  const stub=env.REVENUE.get(env.REVENUE.idFromName('owner-v1'));
  return stub.fetch(new Request('https://internal/command',{method:'POST',body:JSON.stringify({action,input,sessionHash})}));
}
const worker={
  async fetch(request,env){
    try{
      const u=new URL(request.url);
      if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))throw new HttpError(400,'HTTPSで接続してください。');
      if(request.method==='GET'){
        if(u.pathname==='/license')return new Response(license.source+'\n\n'+license.text,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
        if(u.pathname==='/health')return json({service:'noah-revenue-runtime',version:1,cloudResident:true});
        const assets={'/':[page,'text/html'],'/style.css':[css,'text/css'],'/app.js':[script,'application/javascript']};
        if(assets[u.pathname])return new Response(assets[u.pathname][0],{headers:{...headers,'Content-Type':assets[u.pathname][1]+'; charset=utf-8'}});
      }
      if(request.method==='POST'&&u.pathname==='/admin/pair'){
        const supplied=request.headers.get('authorization')||'';
        if(!env.NOAH_REVENUE_ADMIN||supplied.length>256||await revenueDigest(supplied)!==await revenueDigest(`Bearer ${env.NOAH_REVENUE_ADMIN}`))throw new HttpError(401,'管理者の認証が必要です。');
        exact(await body(request),[]);const code=token(),r=await dispatch(env,'pair',{hash:await revenueDigest(code)});if(!r.ok)return r;
        return json({pairUrl:`${u.origin}/#pair=${code}`,expiresAt:(await r.json()).expiresAt});
      }
      const routes={'/api/pair':'exchange','/api/status':'status','/api/example':'example','/api/run':'run','/api/stop':'stop','/api/logout':'logout'};
      const action=routes[u.pathname];if(!action)throw new HttpError(404,'見つかりません。');
      const post=!['status','example'].includes(action);
      if(request.method!==(post?'POST':'GET'))throw new HttpError(405,'操作を確認してください。');
      if(request.headers.get('sec-fetch-site')==='cross-site'||(post&&request.headers.get('origin')!==u.origin))throw new HttpError(403,'本人用Noah画面から操作してください。');
      const input=post?await body(request):{};
      if(action==='exchange'){
        exact(input,['token']);if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token))throw new HttpError(401,'接続コードを確認してください。');
        const secret=token(),r=await dispatch(env,action,{hash:await revenueDigest(input.token),sessionHash:await revenueDigest(secret)});if(!r.ok)return r;
        return json({connected:true},200,{'Set-Cookie':cookie(secret)});
      }
      const secret=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length+1);
      if(!secret||!/^[a-f0-9]{64}$/.test(secret))throw new HttpError(401,'この携帯を本人用Noahへ接続してください。');
      const r=await dispatch(env,action==='example'?'status':action,input,await revenueDigest(secret));if(!r.ok)return r;
      if(action==='example')return json({brief:example.brief});
      if(action==='logout')return json({disconnected:true},200,{'Set-Cookie':cookie('',0)});
      return r;
    }catch(e){return json({error:e instanceof HttpError?e.message:'状態を確認できません。画面を更新してください。'},e instanceof HttpError?e.status:503);}
  }
};
export class NoahRevenueOperation extends RevenueOperation{
  async fetch(request){try{const {action,input,sessionHash}=await request.json();return json(await this.command(action,input,sessionHash));}catch(e){return json({error:e instanceof HttpError?e.message:'保存を確認できません。'},e instanceof HttpError?e.status:503);}}
}

export default worker;
